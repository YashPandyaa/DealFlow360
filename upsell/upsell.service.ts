// upsell/upsell.service.ts
import { prisma } from '../shared/prisma';

export interface UpsellRecommendation {
  productId: string;
  productName: string;
  marginDelta: number;
  isPromoted: boolean;
  coPurchaseScore: number;
}

export class UpsellService {
  // ==========================================================================
  // 1. Recommendation Engine
  // ==========================================================================

  /**
   * Generates ranked upsell/cross-sell recommendations for a quotation.
   *
   * @param quotationId ID or quoteNumber of the quotation
   * @param minMarginThreshold Minimum margin percentage required to recommend a product (default: 0)
   * @returns Ranked array of UpsellRecommendation objects
   */
  async getUpsellRecommendations(
    quotationId: string,
    minMarginThreshold: number = 0
  ): Promise<UpsellRecommendation[]> {
    // 1. Fetch quotation lines
    const quotation = await prisma.quotation.findFirst({
      where: {
        OR: [{ id: quotationId }, { quoteNumber: quotationId }]
      },
      include: {
        lines: {
          include: {
            product: true
          }
        }
      }
    });

    if (!quotation) {
      throw new Error('Quotation not found');
    }

    // Edge Case: Quotation with no lines yet -> return empty array
    if (!quotation.lines || quotation.lines.length === 0) {
      return [];
    }

    // 2. Identify products already in the cart
    const cartProductIds = new Set(quotation.lines.map((l) => l.productId));

    // 3. Find matching UpsellRule entries triggered by cart items
    const rules = await prisma.upsellRule.findMany({
      where: {
        triggerProductId: { in: Array.from(cartProductIds) },
        isActive: true
      }
    });

    if (rules.length === 0) {
      return [];
    }

    // 4. Edge Case: Filter out suggestions for products already in the cart
    const candidateRules = rules.filter((r) => !cartProductIds.has(r.suggestedProductId));
    if (candidateRules.length === 0) {
      return [];
    }

    // 5. Fetch product info for all suggested products
    const suggestedProductIds = Array.from(new Set(candidateRules.map((r) => r.suggestedProductId)));
    const products = await prisma.product.findMany({
      where: {
        id: { in: suggestedProductIds }
      }
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 6. Filter by minMarginThreshold
    const threshold = Number.isNaN(minMarginThreshold) ? 0 : minMarginThreshold;
    const eligibleRules = candidateRules.filter((r) => {
      const prod = productMap.get(r.suggestedProductId);
      if (!prod) return false;
      return (prod.marginPercent ?? 0) >= threshold;
    });

    if (eligibleRules.length === 0) {
      return [];
    }

    // 7. Edge Case: De-duplicate suggestions triggered by multiple cart items
    // Keep the highest-ranked rule instance (isPromoted true > false, then highest coPurchaseScore)
    const bestRuleMap = new Map<string, typeof eligibleRules[0]>();
    for (const rule of eligibleRules) {
      const existing = bestRuleMap.get(rule.suggestedProductId);
      if (!existing) {
        bestRuleMap.set(rule.suggestedProductId, rule);
      } else {
        if (!existing.isPromoted && rule.isPromoted) {
          bestRuleMap.set(rule.suggestedProductId, rule);
        } else if (existing.isPromoted === rule.isPromoted && rule.coPurchaseScore > existing.coPurchaseScore) {
          bestRuleMap.set(rule.suggestedProductId, rule);
        }
      }
    }

    // 8. Rank suggestions: isPromoted first (descending), then coPurchaseScore descending
    const rankedRules = Array.from(bestRuleMap.values()).sort((a, b) => {
      if (a.isPromoted !== b.isPromoted) {
        return a.isPromoted ? -1 : 1;
      }
      return b.coPurchaseScore - a.coPurchaseScore;
    });

    // 9. Format response matching frontend contract exactly
    return rankedRules.map((rule) => {
      const product = productMap.get(rule.suggestedProductId)!;
      // marginDelta = suggested product's margin contribution if added at its base price
      const marginDelta = Math.round((product.basePrice * ((product.marginPercent ?? 0) / 100)) * 100) / 100;

      return {
        productId: product.id,
        productName: product.name,
        marginDelta,
        isPromoted: rule.isPromoted,
        coPurchaseScore: rule.coPurchaseScore
      };
    });
  }

  // ==========================================================================
  // 2. Admin CRUD for UpsellRule
  // ==========================================================================

  async createRule(data: {
    triggerProductId: string;
    suggestedProductId: string;
    coPurchaseScore?: number;
    isPromoted?: boolean;
    isActive?: boolean;
  }) {
    if (!data.triggerProductId || !data.suggestedProductId) {
      throw new Error('triggerProductId and suggestedProductId are required');
    }

    if (data.triggerProductId === data.suggestedProductId) {
      throw new Error('triggerProductId and suggestedProductId cannot be the same');
    }

    // Verify products exist
    const [triggerProduct, suggestedProduct] = await Promise.all([
      prisma.product.findUnique({ where: { id: data.triggerProductId } }),
      prisma.product.findUnique({ where: { id: data.suggestedProductId } })
    ]);

    if (!triggerProduct) {
      throw new Error(`Trigger product with id ${data.triggerProductId} not found`);
    }
    if (!suggestedProduct) {
      throw new Error(`Suggested product with id ${data.suggestedProductId} not found`);
    }

    return prisma.upsellRule.create({
      data: {
        triggerProductId: data.triggerProductId,
        suggestedProductId: data.suggestedProductId,
        coPurchaseScore: data.coPurchaseScore !== undefined ? Number(data.coPurchaseScore) : 0,
        isPromoted: data.isPromoted !== undefined ? Boolean(data.isPromoted) : false,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true
      }
    });
  }

  async getRules(filter?: { triggerProductId?: string; isActive?: boolean }) {
    const where: any = {};
    if (filter?.triggerProductId) where.triggerProductId = filter.triggerProductId;
    if (filter?.isActive !== undefined) where.isActive = filter.isActive;

    return prisma.upsellRule.findMany({
      where,
      orderBy: [{ isPromoted: 'desc' }, { coPurchaseScore: 'desc' }]
    });
  }

  async getRuleById(id: string) {
    const rule = await prisma.upsellRule.findUnique({
      where: { id }
    });
    if (!rule) {
      throw new Error('Upsell rule not found');
    }
    return rule;
  }

  async updateRule(
    id: string,
    data: {
      triggerProductId?: string;
      suggestedProductId?: string;
      coPurchaseScore?: number;
      isPromoted?: boolean;
      isActive?: boolean;
    }
  ) {
    await this.getRuleById(id);

    const updateData: any = {};
    if (data.triggerProductId !== undefined) updateData.triggerProductId = data.triggerProductId;
    if (data.suggestedProductId !== undefined) updateData.suggestedProductId = data.suggestedProductId;
    if (data.coPurchaseScore !== undefined) updateData.coPurchaseScore = Number(data.coPurchaseScore);
    if (data.isPromoted !== undefined) updateData.isPromoted = Boolean(data.isPromoted);
    if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);

    return prisma.upsellRule.update({
      where: { id },
      data: updateData
    });
  }

  async deleteRule(id: string) {
    await this.getRuleById(id);
    return prisma.upsellRule.delete({
      where: { id }
    });
  }
}

export const upsellService = new UpsellService();
