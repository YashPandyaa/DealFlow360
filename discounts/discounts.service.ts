// discounts/discounts.service.ts
import { prisma } from '../shared/prisma';

export const ALLOWED_CUSTOMER_TIERS = ['BRONZE', 'SILVER', 'GOLD'] as const;
export const ALLOWED_APPROVER_ROLES = ['MANAGER', 'MANAGER_THEN_FINANCE'] as const;

export type CustomerTierType = typeof ALLOWED_CUSTOMER_TIERS[number];
export type RequiredApproverType = typeof ALLOWED_APPROVER_ROLES[number];

export interface RiskCalculationLine {
  productId?: string;
  productName?: string;
  product?: { name?: string; category?: string; costPrice?: number; basePrice?: number; sellingPrice?: number };
  category: string;
  quantity?: number;
  unitPrice?: number;
  costPrice?: number;
  discountPercent?: number;
  discount?: number;
  lineTotal?: number;
  totalPrice?: number;
}

export interface CalculateRiskInput {
  quotationId?: string;
  salesRepId?: string;
  customerTier?: string;
  customerId?: string;
  customerName?: string;
  lines: RiskCalculationLine[];
}

export interface FlaggedLine {
  product?: string;
  category: string;
  discountPercent: number;
  applied_discount?: number;
  allowedLimit: number;
  allowed_discount?: number;
  categoryCeiling: number;
  customerLimit: number;
  overage: number;
  excess?: number;
  line_risk?: number;
  lineTotal: number;
  line_total?: number;
}

export interface RiskComponentBreakdown {
  discount_ceiling_risk: number;
  margin_risk: number;
  blended_order_risk: number;
  historical_anomaly_risk: number;
  historical_data_status: string;
  has_sufficient_history: boolean;
  gross_margin_percentage: number;
  weighted_excess: number;
  historical_avg_discount?: number;
  current_avg_discount?: number;
}

export interface RiskViolationLine {
  product: string;
  category: string;
  applied_discount: number;
  allowed_discount: number;
  excess: number;
  line_risk: number;
  line_total: number;
}

export interface RiskApprovalInfo {
  required: boolean;
  steps: string[];
}

export interface CalculateRiskResult {
  risk_score: number;
  blendedRiskScore: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  components: RiskComponentBreakdown;
  violations: RiskViolationLine[];
  lineDetails: FlaggedLine[];
  flaggedLines: FlaggedLine[];
  approval: RiskApprovalInfo;
  requiresApproval: boolean;
  requiredApprovalChain: string | null;
  effectiveCustomerLimit: number;
  calculation_version: string;
  calculated_at: string;
}

export class DiscountsService {
  // ============================================================================
  // 1. DiscountTier CRUD
  // ============================================================================

  async ensureDiscountConfigsSeeded(): Promise<void> {
    try {
      const defaultTiers = [
        { customerTier: 'GOLD', maxDiscountPercent: 15.0 },
        { customerTier: 'SILVER', maxDiscountPercent: 10.0 },
        { customerTier: 'BRONZE', maxDiscountPercent: 5.0 }
      ];

      for (const tier of defaultTiers) {
        await prisma.discountTier.upsert({
          where: { customerTier: tier.customerTier },
          create: tier,
          update: {}
        });
      }

      const defaultCategories = [
        { category: 'Hardware', maxDiscountPercent: 15.0 },
        { category: 'Software', maxDiscountPercent: 10.0 },
        { category: 'Services', maxDiscountPercent: 5.0 },
        { category: 'Service', maxDiscountPercent: 5.0 },
        { category: 'Subscriptions', maxDiscountPercent: 20.0 }
      ];

      for (const cat of defaultCategories) {
        await prisma.categoryDiscountCeiling.upsert({
          where: { category: cat.category },
          create: cat,
          update: {}
        });
      }

      const chainCount = await prisma.approvalChain.count();
      if (chainCount === 0) {
        await prisma.approvalChain.createMany({
          data: [
            { minRiskScore: 0.0, maxRiskScore: 50.0, requiredApprovers: 'MANAGER' },
            { minRiskScore: 50.01, maxRiskScore: null, requiredApprovers: 'MANAGER_THEN_FINANCE' }
          ]
        });
      }
    } catch (err) {
      console.warn('Auto discount config seeding error:', err);
    }
  }

  async createDiscountTier(data: { customerTier: string; maxDiscountPercent: number }) {
    const tierUpper = data.customerTier?.toUpperCase();
    if (!ALLOWED_CUSTOMER_TIERS.includes(tierUpper as any)) {
      throw new Error(`Invalid customer tier '${data.customerTier}'. Allowed values: ${ALLOWED_CUSTOMER_TIERS.join(', ')}`);
    }

    if (data.maxDiscountPercent === undefined || data.maxDiscountPercent < 0) {
      throw new Error('maxDiscountPercent must be a non-negative number');
    }

    return prisma.discountTier.create({
      data: {
        customerTier: tierUpper,
        maxDiscountPercent: Number(data.maxDiscountPercent)
      }
    });
  }

  async getAllDiscountTiers() {
    await this.ensureDiscountConfigsSeeded();
    return prisma.discountTier.findMany({
      orderBy: { createdAt: 'asc' }
    });
  }

  async getDiscountTierById(id: string) {
    const tier = await prisma.discountTier.findUnique({ where: { id } });
    if (!tier) {
      throw new Error(`DiscountTier with ID '${id}' not found`);
    }
    return tier;
  }

  async updateDiscountTier(id: string, data: { customerTier?: string; maxDiscountPercent?: number }) {
    await this.getDiscountTierById(id);

    const updateData: { customerTier?: string; maxDiscountPercent?: number } = {};

    if (data.customerTier !== undefined) {
      const tierUpper = data.customerTier.toUpperCase();
      if (!ALLOWED_CUSTOMER_TIERS.includes(tierUpper as any)) {
        throw new Error(`Invalid customer tier '${data.customerTier}'. Allowed values: ${ALLOWED_CUSTOMER_TIERS.join(', ')}`);
      }
      updateData.customerTier = tierUpper;
    }

    if (data.maxDiscountPercent !== undefined) {
      if (data.maxDiscountPercent < 0) {
        throw new Error('maxDiscountPercent must be a non-negative number');
      }
      updateData.maxDiscountPercent = Number(data.maxDiscountPercent);
    }

    return prisma.discountTier.update({
      where: { id },
      data: updateData
    });
  }

  async deleteDiscountTier(id: string) {
    await this.getDiscountTierById(id);
    return prisma.discountTier.delete({ where: { id } });
  }

  // ============================================================================
  // 2. CategoryDiscountCeiling CRUD
  // ============================================================================

  async createCategoryDiscountCeiling(data: { category: string; maxDiscountPercent: number }) {
    if (!data.category || typeof data.category !== 'string' || data.category.trim() === '') {
      throw new Error('Category name is required');
    }

    if (data.maxDiscountPercent === undefined || data.maxDiscountPercent < 0) {
      throw new Error('maxDiscountPercent must be a non-negative number');
    }

    return prisma.categoryDiscountCeiling.create({
      data: {
        category: data.category.trim(),
        maxDiscountPercent: Number(data.maxDiscountPercent)
      }
    });
  }

  async getAllCategoryDiscountCeilings() {
    await this.ensureDiscountConfigsSeeded();
    return prisma.categoryDiscountCeiling.findMany({
      orderBy: { category: 'asc' }
    });
  }

  async getCategoryDiscountCeilingById(id: string) {
    const ceiling = await prisma.categoryDiscountCeiling.findUnique({ where: { id } });
    if (!ceiling) {
      throw new Error(`CategoryDiscountCeiling with ID '${id}' not found`);
    }
    return ceiling;
  }

  async updateCategoryDiscountCeiling(id: string, data: { category?: string; maxDiscountPercent?: number }) {
    await this.getCategoryDiscountCeilingById(id);

    const updateData: { category?: string; maxDiscountPercent?: number } = {};

    if (data.category !== undefined) {
      if (typeof data.category !== 'string' || data.category.trim() === '') {
        throw new Error('Category name is required');
      }
      updateData.category = data.category.trim();
    }

    if (data.maxDiscountPercent !== undefined) {
      if (data.maxDiscountPercent < 0) {
        throw new Error('maxDiscountPercent must be a non-negative number');
      }
      updateData.maxDiscountPercent = Number(data.maxDiscountPercent);
    }

    return prisma.categoryDiscountCeiling.update({
      where: { id },
      data: updateData
    });
  }

  async deleteCategoryDiscountCeiling(id: string) {
    await this.getCategoryDiscountCeilingById(id);
    return prisma.categoryDiscountCeiling.delete({ where: { id } });
  }

  // ============================================================================
  // 3. CustomerDiscountLimit CRUD
  // ============================================================================

  async setCustomerDiscountLimit(data: { customerId: string; customerName?: string; maxDiscountPercent: number }) {
    if (!data.customerId || typeof data.customerId !== 'string' || data.customerId.trim() === '') {
      throw new Error('customerId is required');
    }

    if (data.maxDiscountPercent === undefined || data.maxDiscountPercent < 0) {
      throw new Error('maxDiscountPercent must be a non-negative number');
    }

    const cid = data.customerId.trim();
    const existing = await prisma.customerDiscountLimit.findFirst({
      where: { OR: [{ customerId: cid }, { customerName: data.customerName || cid }] }
    });

    if (existing) {
      return prisma.customerDiscountLimit.update({
        where: { id: existing.id },
        data: {
          maxDiscountPercent: Number(data.maxDiscountPercent),
          customerName: data.customerName || existing.customerName
        }
      });
    } else {
      return prisma.customerDiscountLimit.create({
        data: {
          customerId: cid,
          customerName: data.customerName || cid,
          maxDiscountPercent: Number(data.maxDiscountPercent)
        }
      });
    }
  }

  async getAllCustomerDiscountLimits() {
    return prisma.customerDiscountLimit.findMany({
      orderBy: { customerId: 'asc' }
    });
  }

  async getCustomerDiscountLimit(customerId: string) {
    if (!customerId) return null;
    const record = await prisma.customerDiscountLimit.findFirst({
      where: { OR: [{ customerId }, { customerName: customerId }] }
    });
    return record;
  }

  async deleteCustomerDiscountLimit(id: string) {
    return prisma.customerDiscountLimit.delete({ where: { id } });
  }

  // ============================================================================
  // 4. ApprovalChain CRUD
  // ============================================================================

  async createApprovalChain(data: { minRiskScore: number; maxRiskScore?: number | null; requiredApprovers: string }) {
    if (data.minRiskScore === undefined || data.minRiskScore < 0) {
      throw new Error('minRiskScore must be a non-negative number');
    }

    const approverUpper = data.requiredApprovers?.toUpperCase();
    if (!ALLOWED_APPROVER_ROLES.includes(approverUpper as any)) {
      throw new Error(`Invalid requiredApprovers '${data.requiredApprovers}'. Allowed values: ${ALLOWED_APPROVER_ROLES.join(', ')}`);
    }

    return prisma.approvalChain.create({
      data: {
        minRiskScore: Number(data.minRiskScore),
        maxRiskScore: data.maxRiskScore !== undefined && data.maxRiskScore !== null ? Number(data.maxRiskScore) : null,
        requiredApprovers: approverUpper
      }
    });
  }

  async getAllApprovalChains() {
    return prisma.approvalChain.findMany({
      orderBy: { minRiskScore: 'asc' }
    });
  }

  async getApprovalChainById(id: string) {
    const chain = await prisma.approvalChain.findUnique({ where: { id } });
    if (!chain) {
      throw new Error(`ApprovalChain with ID '${id}' not found`);
    }
    return chain;
  }

  async updateApprovalChain(id: string, data: { minRiskScore?: number; maxRiskScore?: number | null; requiredApprovers?: string }) {
    await this.getApprovalChainById(id);

    const updateData: { minRiskScore?: number; maxRiskScore?: number | null; requiredApprovers?: string } = {};

    if (data.minRiskScore !== undefined) {
      if (data.minRiskScore < 0) {
        throw new Error('minRiskScore must be a non-negative number');
      }
      updateData.minRiskScore = Number(data.minRiskScore);
    }

    if (data.maxRiskScore !== undefined) {
      updateData.maxRiskScore = data.maxRiskScore !== null ? Number(data.maxRiskScore) : null;
    }

    if (data.requiredApprovers !== undefined) {
      const approverUpper = data.requiredApprovers.toUpperCase();
      if (!ALLOWED_APPROVER_ROLES.includes(approverUpper as any)) {
        throw new Error(`Invalid requiredApprovers '${data.requiredApprovers}'. Allowed values: ${ALLOWED_APPROVER_ROLES.join(', ')}`);
      }
      updateData.requiredApprovers = approverUpper;
    }

    return prisma.approvalChain.update({
      where: { id },
      data: updateData
    });
  }

  async deleteApprovalChain(id: string) {
    await this.getApprovalChainById(id);
    return prisma.approvalChain.delete({ where: { id } });
  }

  // ============================================================================
  // 5. Core Logic: Dynamic Blended Risk Scoring Engine
  // Formula = Discount Ceiling Risk (50) + Margin Risk (25) + Blended Order Risk (15) + Historical Anomaly (10)
  // Max = 100, Clamped min 0 max 100
  // ============================================================================

  async calculateRisk(input: CalculateRiskInput): Promise<CalculateRiskResult> {
    await this.ensureDiscountConfigsSeeded();
    const { quotationId, salesRepId, customerTier, customerId, customerName, lines } = input;

    // 1. Resolve Customer Tier Limit & Customer-Specific Discount Limit dynamically
    let tierMaxDiscount = 100.0;
    if (customerTier) {
      const tierKey = customerTier.toUpperCase();
      const discountTier = await prisma.discountTier.findUnique({
        where: { customerTier: tierKey }
      });
      if (!discountTier) {
        const err = new Error(`Customer tier '${customerTier}' not found in discount tier configuration`);
        (err as any).statusCode = 400;
        throw err;
      }
      tierMaxDiscount = discountTier.maxDiscountPercent;
    }

    let customerMaxDiscount: number | null = null;

    if (customerId || customerName) {
      const custRecord = await prisma.customerDiscountLimit.findFirst({
        where: {
          OR: [
            ...(customerId ? [{ customerId }] : []),
            ...(customerName ? [{ customerName }] : []),
            ...(customerId ? [{ customerName: customerId }] : [])
          ]
        }
      });
      if (custRecord) {
        customerMaxDiscount = custRecord.maxDiscountPercent;
      }
    }

    if (customerMaxDiscount === null && customerId) {
      const dbUser = await prisma.user.findFirst({
        where: { OR: [{ id: customerId }, { email: customerId }] }
      }).catch(() => null);

      if (dbUser && typeof dbUser.maxDiscountLimit === 'number') {
        customerMaxDiscount = dbUser.maxDiscountLimit;
      }
    }

    if (customerMaxDiscount === null) {
      customerMaxDiscount = customerTier ? tierMaxDiscount : 15.0;
    }

    // Edge case: Empty lines array -> return 0 risk score and no approval required
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return {
        risk_score: 0,
        blendedRiskScore: 0,
        risk_level: 'LOW',
        components: {
          discount_ceiling_risk: 0,
          margin_risk: 0,
          blended_order_risk: 0,
          historical_anomaly_risk: 0,
          historical_data_status: 'Insufficient historical data',
          has_sufficient_history: false,
          gross_margin_percentage: 0,
          weighted_excess: 0
        },
        violations: [],
        lineDetails: [],
        flaggedLines: [],
        approval: {
          required: false,
          steps: []
        },
        requiresApproval: false,
        requiredApprovalChain: null,
        effectiveCustomerLimit: customerMaxDiscount,
        calculation_version: '2.0_blended',
        calculated_at: new Date().toISOString()
      };
    }

    // Process line metadata
    const lineDetails: FlaggedLine[] = [];
    const flaggedLines: FlaggedLine[] = [];
    const violations: RiskViolationLine[] = [];

    let totalQuotationRevenue = 0;
    let totalQuotationCost = 0;
    let totalGrossValue = 0;
    let totalDiscountedAmount = 0;

    const processedLineMeta: Array<{
      productName: string;
      category: string;
      appliedDiscount: number;
      allowedDiscount: number;
      excess: number;
      discountLineRisk: number;
      quantity: number;
      unitPrice: number;
      costPrice: number;
      netUnitPrice: number;
      lineRevenue: number;
      lineCost: number;
    }> = [];

    for (const line of lines) {
      if (!line.category) {
        throw new Error('Each line must have a category specified');
      }

      const appliedDiscount = Number(
        line.discountPercent !== undefined
          ? line.discountPercent
          : line.discount !== undefined
          ? line.discount
          : 0
      );

      if (appliedDiscount < 0 || appliedDiscount > 100) {
        const err = new Error(`Discount percent (${appliedDiscount}%) must be between 0 and 100`);
        (err as any).statusCode = 400;
        throw err;
      }

      let ceilingRecord = await prisma.categoryDiscountCeiling.findUnique({
        where: { category: line.category }
      });

      if (!ceilingRecord) {
        const allCeilings = await prisma.categoryDiscountCeiling.findMany();
        ceilingRecord =
          allCeilings.find(
            (c) =>
              c.category.toLowerCase() === line.category.toLowerCase() ||
              c.category.toLowerCase().replace(/s$/, '') === line.category.toLowerCase().replace(/s$/, '')
          ) || null;
      }

      if (!ceilingRecord) {
        const err = new Error(`Category '${line.category}' not found in category discount ceiling configuration`);
        (err as any).statusCode = 400;
        throw err;
      }

      const categoryCeiling = ceilingRecord ? ceilingRecord.maxDiscountPercent : 100.0;
      const allowedDiscount = Math.min(customerMaxDiscount, tierMaxDiscount, categoryCeiling);

      const excess = Math.max(0, appliedDiscount - allowedDiscount);
      const discountLineRisk = Math.min(50, (excess / 20) * 50);

      let unitPrice = Number(line.unitPrice || 0);
      let costPrice = Number(line.costPrice || 0);

      // Product fallback lookup if needed
      if ((!unitPrice || !costPrice) && line.productId) {
        const p = await prisma.product.findUnique({ where: { id: line.productId } }).catch(() => null);
        if (p) {
          if (!unitPrice) unitPrice = p.basePrice || 0;
          if (!costPrice) {
            const margin = (p.marginPercent !== null && p.marginPercent !== undefined && p.marginPercent > 0) ? p.marginPercent : 30.0;
            costPrice = p.costPrice || unitPrice * (1 - margin / 100);
          }
        }
      }
      if (!costPrice && unitPrice > 0) {
        const margin = (line as any).product?.marginPercent || 30.0;
        costPrice = unitPrice * (1 - margin / 100);
      }

      const quantity = Number(line.quantity || 1);
      const netUnitPrice = unitPrice * (1 - appliedDiscount / 100);
      let lineRevenue = Number(line.lineTotal || line.totalPrice || 0);
      if (!lineRevenue && unitPrice > 0) {
        lineRevenue = Number((netUnitPrice * quantity).toFixed(2));
      }
      const lineCost = Number((costPrice * quantity).toFixed(2));

      totalQuotationRevenue += lineRevenue;
      totalQuotationCost += lineCost;
      totalGrossValue += unitPrice * quantity;
      totalDiscountedAmount += unitPrice * quantity * (appliedDiscount / 100);

      const prodName = line.productName || line.product?.name || line.category || 'Product';

      processedLineMeta.push({
        productName: prodName,
        category: line.category,
        appliedDiscount,
        allowedDiscount,
        excess,
        discountLineRisk,
        quantity,
        unitPrice,
        costPrice,
        netUnitPrice,
        lineRevenue,
        lineCost
      });

      const detailEntry: FlaggedLine = {
        product: prodName,
        category: line.category,
        discountPercent: appliedDiscount,
        applied_discount: appliedDiscount,
        allowedLimit: allowedDiscount,
        allowed_discount: allowedDiscount,
        categoryCeiling,
        customerLimit: customerMaxDiscount,
        overage: Number(excess.toFixed(4)),
        excess: Number(excess.toFixed(4)),
        line_risk: Number(discountLineRisk.toFixed(2)),
        lineTotal: lineRevenue,
        line_total: lineRevenue
      };

      lineDetails.push(detailEntry);

      if (excess > 0) {
        flaggedLines.push(detailEntry);
        violations.push({
          product: prodName,
          category: line.category,
          applied_discount: appliedDiscount,
          allowed_discount: allowedDiscount,
          excess: Number(excess.toFixed(2)),
          line_risk: Number(discountLineRisk.toFixed(2)),
          line_total: lineRevenue
        });
      }
    }

    // -------------------------------------------------------------
    // Component 1: Discount Ceiling Risk (Max 50 points)
    // -------------------------------------------------------------
    let discount_ceiling_risk = 0;
    if (totalQuotationRevenue > 0) {
      const rawRisk = processedLineMeta.reduce((sum, item) => {
        return sum + item.discountLineRisk * (item.lineRevenue / totalQuotationRevenue);
      }, 0);
      discount_ceiling_risk = Math.min(50, Math.round(rawRisk * 100) / 100);
    } else if (processedLineMeta.some((i) => i.excess > 0)) {
      discount_ceiling_risk = Math.min(50, Math.round(Math.max(...processedLineMeta.map((i) => i.discountLineRisk)) * 100) / 100);
    }

    // -------------------------------------------------------------
    // Component 2: Margin Risk (Max 25 points)
    // -------------------------------------------------------------
    let gross_margin_percentage = 100;
    if (totalQuotationRevenue > 0 && totalQuotationCost > 0) {
      gross_margin_percentage = Math.round(((totalQuotationRevenue - totalQuotationCost) / totalQuotationRevenue) * 10000) / 100;
    } else if (totalQuotationRevenue === 0 && totalQuotationCost > 0) {
      gross_margin_percentage = -100;
    } else {
      gross_margin_percentage = 100;
    }

    let margin_risk = 0;
    if (gross_margin_percentage >= 30) {
      margin_risk = 0;
    } else if (gross_margin_percentage >= 20) {
      margin_risk = 8;
    } else if (gross_margin_percentage >= 10) {
      margin_risk = 15;
    } else if (gross_margin_percentage >= 0) {
      margin_risk = 22;
    } else {
      margin_risk = 25;
    }

    // -------------------------------------------------------------
    // Component 3: Blended Order Risk (Max 15 points)
    // -------------------------------------------------------------
    let weighted_excess = 0;
    if (totalQuotationRevenue > 0) {
      const rawWeightedExcess = processedLineMeta.reduce((sum, item) => {
        return sum + item.excess * (item.lineRevenue / totalQuotationRevenue);
      }, 0);
      weighted_excess = Math.round(rawWeightedExcess * 100) / 100;
    } else if (processedLineMeta.some((i) => i.excess > 0)) {
      weighted_excess = Math.round(Math.max(...processedLineMeta.map((i) => i.excess)) * 100) / 100;
    }

    let blended_order_risk = 0;
    if (weighted_excess === 0) {
      blended_order_risk = 0;
    } else if (weighted_excess < 2) {
      blended_order_risk = 4;
    } else if (weighted_excess < 4) {
      blended_order_risk = 8;
    } else if (weighted_excess < 6) {
      blended_order_risk = 12;
    } else {
      blended_order_risk = 15;
    }

    // -------------------------------------------------------------
    // Component 4: Historical Discount Anomaly (Max 10 points)
    // -------------------------------------------------------------
    let historical_anomaly_risk = 0;
    let has_sufficient_history = false;
    let historical_data_status = 'Insufficient historical data';
    let historical_avg_discount: number | undefined;
    let current_avg_discount: number | undefined;

    const repIdToQuery = salesRepId || (quotationId ? (await prisma.quotation.findUnique({ where: { id: quotationId } }))?.userId : null);

    if (repIdToQuery) {
      const pastQuotes = await prisma.quotation.findMany({
        where: {
          userId: repIdToQuery,
          status: { in: ['CONFIRMED', 'APPROVED', 'READY_FOR_FULFILLMENT', 'SUBMITTED', 'PENDING_APPROVAL'] },
          id: quotationId ? { not: quotationId } : undefined
        },
        include: { lines: true }
      }).catch(() => []);

      if (pastQuotes.length >= 1) {
        let pastTotalGross = 0;
        let pastTotalDiscAmount = 0;

        for (const q of pastQuotes) {
          for (const l of q.lines) {
            const lQty = l.quantity || 1;
            const lPrice = l.unitPrice || 0;
            const lDisc = l.discount || 0;
            pastTotalGross += lPrice * lQty;
            pastTotalDiscAmount += lPrice * lQty * (lDisc / 100);
          }
        }

        if (pastTotalGross > 0) {
          has_sufficient_history = true;
          historical_data_status = 'Sufficient historical data';
          historical_avg_discount = Math.round((pastTotalDiscAmount / pastTotalGross) * 10000) / 100;
          current_avg_discount = totalGrossValue > 0 ? Math.round((totalDiscountedAmount / totalGrossValue) * 10000) / 100 : 0;

          const diff = Math.max(0, current_avg_discount - historical_avg_discount);
          if (diff <= 3) {
            historical_anomaly_risk = 0;
          } else if (diff <= 6) {
            historical_anomaly_risk = 3;
          } else if (diff <= 10) {
            historical_anomaly_risk = 6;
          } else if (diff <= 15) {
            historical_anomaly_risk = 8;
          } else {
            historical_anomaly_risk = 10;
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Final Risk Score & Clamping
    // -------------------------------------------------------------
    const rawFinalScore = discount_ceiling_risk + margin_risk + blended_order_risk + historical_anomaly_risk;
    const risk_score = Math.min(100, Math.max(0, Math.round(rawFinalScore * 100) / 100));
    const blendedRiskScore = weighted_excess;

    // -------------------------------------------------------------
    // Risk Level Assignment
    // -------------------------------------------------------------
    let risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (risk_score >= 75) {
      risk_level = 'CRITICAL';
    } else if (risk_score >= 50) {
      risk_level = 'HIGH';
    } else if (risk_score >= 25) {
      risk_level = 'MEDIUM';
    } else {
      risk_level = 'LOW';
    }

    // -------------------------------------------------------------
    // Approval Routing Determination
    // -------------------------------------------------------------
    let requiresApproval = false;
    let requiredApprovalChain: string | null = null;
    let approvalSteps: string[] = [];

    if (flaggedLines.length > 0 || risk_score >= 25) {
      requiresApproval = true;

      const approvalChains = await prisma.approvalChain.findMany({
        orderBy: { minRiskScore: 'asc' }
      }).catch(() => []);

      const scoreToTest = weighted_excess > 0 ? weighted_excess : risk_score;

      for (const chain of approvalChains) {
        if (
          scoreToTest >= chain.minRiskScore &&
          (chain.maxRiskScore === null || chain.maxRiskScore === undefined || scoreToTest <= chain.maxRiskScore)
        ) {
          requiredApprovalChain = chain.requiredApprovers;
          break;
        }
      }

      if (!requiredApprovalChain) {
        requiredApprovalChain = risk_score >= 75 || blendedRiskScore > 50 ? 'MANAGER_THEN_FINANCE' : 'MANAGER';
      }

      if (requiredApprovalChain === 'MANAGER_THEN_FINANCE' || risk_score >= 75) {
        approvalSteps = ['SALES_MANAGER', 'FINANCE_OPERATIONS'];
      } else {
        approvalSteps = ['SALES_MANAGER'];
      }
    }

    return {
      risk_score,
      blendedRiskScore,
      risk_level,
      components: {
        discount_ceiling_risk,
        margin_risk,
        blended_order_risk,
        historical_anomaly_risk,
        historical_data_status,
        has_sufficient_history,
        gross_margin_percentage,
        weighted_excess,
        historical_avg_discount,
        current_avg_discount
      },
      violations,
      lineDetails,
      flaggedLines,
      approval: {
        required: requiresApproval,
        steps: approvalSteps
      },
      requiresApproval,
      requiredApprovalChain,
      effectiveCustomerLimit: customerMaxDiscount,
      calculation_version: '2.0_blended',
      calculated_at: new Date().toISOString()
    };
  }
}

export const discountsService = new DiscountsService();

