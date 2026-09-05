// discounts/discounts.service.ts
import { prisma } from '../shared/prisma';

export const ALLOWED_CUSTOMER_TIERS = ['BRONZE', 'SILVER', 'GOLD'] as const;
export const ALLOWED_APPROVER_ROLES = ['MANAGER', 'MANAGER_THEN_FINANCE'] as const;

export type CustomerTierType = typeof ALLOWED_CUSTOMER_TIERS[number];
export type RequiredApproverType = typeof ALLOWED_APPROVER_ROLES[number];

export interface RiskCalculationLine {
  category: string;
  discountPercent: number;
  lineTotal: number;
}

export interface CalculateRiskInput {
  customerTier: string;
  lines: RiskCalculationLine[];
}

export interface FlaggedLine {
  category: string;
  discountPercent: number;
  categoryCeiling: number;
  overage: number;
  lineTotal: number;
}

export interface CalculateRiskResult {
  blendedRiskScore: number;
  flaggedLines: FlaggedLine[];
  requiredApprovalChain: string | null;
}

export class DiscountsService {
  // ============================================================================
  // 1. DiscountTier CRUD
  // ============================================================================

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
        throw new Error('Category name cannot be empty');
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
  // 3. ApprovalChain CRUD
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
  // 4. Core Logic: Risk Calculation
  // ============================================================================

  async calculateRisk(input: CalculateRiskInput): Promise<CalculateRiskResult> {
    const { customerTier, lines } = input;

    if (!customerTier) {
      throw new Error('customerTier is required');
    }

    // 1. Validate customer tier in config database
    const tierUpper = customerTier.toUpperCase();
    const discountTier = await prisma.discountTier.findUnique({
      where: { customerTier: tierUpper }
    });

    if (!discountTier) {
      throw new Error(`Customer tier '${customerTier}' not found in discount tier configuration`);
    }

    // 2. Edge case: Empty lines array -> return 0 risk score and no approval required
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return {
        blendedRiskScore: 0,
        flaggedLines: [],
        requiredApprovalChain: null
      };
    }

    // 3. For each line, look up category discount ceiling and calculate overage
    const flaggedLines: FlaggedLine[] = [];
    const overages: number[] = [];
    let orderTotal = 0;

    for (const line of lines) {
      if (!line.category) {
        throw new Error('Each line must have a category specified');
      }

      const ceilingRecord = await prisma.categoryDiscountCeiling.findUnique({
        where: { category: line.category }
      });

      if (!ceilingRecord) {
        throw new Error(`Category '${line.category}' not found in category discount ceiling configuration`);
      }

      const categoryCeiling = ceilingRecord.maxDiscountPercent;
      const discountPercent = Number(line.discountPercent || 0);
      const lineTotal = Number(line.lineTotal || 0);

      orderTotal += lineTotal;

      const overage = Math.max(0, discountPercent - categoryCeiling);
      overages.push(overage);

      if (overage > 0) {
        flaggedLines.push({
          category: line.category,
          discountPercent,
          categoryCeiling,
          overage: Number(overage.toFixed(4)),
          lineTotal
        });
      }
    }

    // 4. Calculate blended risk score: blendedScore = Σ (overage_i * (lineTotal_i / orderTotal))
    let blendedRiskScore = 0;
    if (orderTotal > 0) {
      const rawScore = lines.reduce((sum, line, i) => {
        const lineTotal = Number(line.lineTotal || 0);
        return sum + (overages[i] * (lineTotal / orderTotal));
      }, 0);
      blendedRiskScore = Number(rawScore.toFixed(4));
    }

    // 5. Match blended risk score against ApprovalChain configuration
    let requiredApprovalChain: string | null = null;

    if (blendedRiskScore > 0 && flaggedLines.length > 0) {
      const approvalChains = await prisma.approvalChain.findMany({
        orderBy: { minRiskScore: 'asc' }
      });

      for (const chain of approvalChains) {
        if (
          blendedRiskScore >= chain.minRiskScore &&
          (chain.maxRiskScore === null || chain.maxRiskScore === undefined || blendedRiskScore <= chain.maxRiskScore)
        ) {
          requiredApprovalChain = chain.requiredApprovers;
          break;
        }
      }
    }

    return {
      blendedRiskScore,
      flaggedLines,
      requiredApprovalChain
    };
  }
}

export const discountsService = new DiscountsService();
