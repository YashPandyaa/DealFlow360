// products/products.service.ts
import { prisma } from '../shared/prisma';

export const FX_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  CAD: 1.35,
  INR: 83.5
};

export interface CreateVariantInput {
  attribute: string;
  value: string;
  extraPrice?: number;
}

export interface CreateProductInput {
  sku?: string;
  name: string;
  description?: string;
  category?: string;
  basePrice: number;
  unit?: string;
  tax?: number;
  marginPercent?: number;
  currency?: string;
  variants?: CreateVariantInput[];
}

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  basePrice?: number;
  unit?: string;
  tax?: number;
  marginPercent?: number;
  currency?: string;
}

export interface GetProductsFilter {
  category?: string;
  search?: string;
}

export class ProductsService {
  // ============================================================================
  // 1. Product CRUD
  // ============================================================================

  async createProduct(data: CreateProductInput) {
    if (!data.name || data.name.trim() === '') {
      const err = new Error('Product name is required');
      (err as any).statusCode = 400;
      throw err;
    }

    if (data.basePrice === undefined || typeof data.basePrice !== 'number' || data.basePrice < 0) {
      const err = new Error('basePrice must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    if (data.marginPercent !== undefined && (typeof data.marginPercent !== 'number' || data.marginPercent < 0)) {
      const err = new Error('marginPercent must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    const sku = data.sku || `SKU-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    return prisma.product.create({
      data: {
        sku,
        name: data.name.trim(),
        description: data.description || null,
        category: data.category ? data.category.trim() : null,
        basePrice: Number(data.basePrice),
        unit: data.unit || 'PCS',
        tax: data.tax !== undefined ? Number(data.tax) : 0,
        marginPercent: data.marginPercent !== undefined ? Number(data.marginPercent) : 0,
        currency: data.currency ? data.currency.toUpperCase() : 'USD',
        variants: data.variants && data.variants.length > 0 ? {
          create: data.variants.map(v => ({
            attribute: v.attribute,
            value: v.value,
            extraPrice: v.extraPrice !== undefined ? Number(v.extraPrice) : 0
          }))
        } : undefined
      },
      include: {
        variants: true,
        priceLists: true
      }
    });
  }

  async getProducts(filter?: GetProductsFilter) {
    const where: any = {};

    if (filter?.category) {
      where.category = {
        equals: filter.category
      };
    }

    if (filter?.search) {
      const query = filter.search.trim();
      where.OR = [
        { name: { contains: query } },
        { sku: { contains: query } },
        { description: { contains: query } }
      ];
    }

    return prisma.product.findMany({
      where,
      include: {
        variants: true,
        priceLists: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getProductById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        priceLists: true
      }
    });

    if (!product) {
      const err = new Error(`Product with ID '${id}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    return product;
  }

  async updateProduct(id: string, data: UpdateProductInput) {
    await this.getProductById(id);

    if (data.basePrice !== undefined && (typeof data.basePrice !== 'number' || data.basePrice < 0)) {
      const err = new Error('basePrice must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    if (data.marginPercent !== undefined && (typeof data.marginPercent !== 'number' || data.marginPercent < 0)) {
      const err = new Error('marginPercent must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    return prisma.product.update({
      where: { id },
      data: {
        sku: data.sku,
        name: data.name !== undefined ? data.name.trim() : undefined,
        description: data.description,
        category: data.category !== undefined ? data.category.trim() : undefined,
        basePrice: data.basePrice !== undefined ? Number(data.basePrice) : undefined,
        unit: data.unit,
        tax: data.tax !== undefined ? Number(data.tax) : undefined,
        marginPercent: data.marginPercent !== undefined ? Number(data.marginPercent) : undefined,
        currency: data.currency ? data.currency.toUpperCase() : undefined
      },
      include: {
        variants: true,
        priceLists: true
      }
    });
  }

  async deleteProduct(id: string) {
    await this.getProductById(id);

    // Referential integrity checks
    const quotationLineCount = await prisma.quotationLine.count({ where: { productId: id } });
    const priceListCount = await prisma.priceList.count({ where: { productId: id } });

    if (quotationLineCount > 0 || priceListCount > 0) {
      const err = new Error(`Cannot delete product '${id}' because it is referenced in existing quotations or price lists`);
      (err as any).statusCode = 409;
      throw err;
    }

    return prisma.product.delete({ where: { id } });
  }

  // ============================================================================
  // 2. Product Variant CRUD
  // ============================================================================

  async createVariant(productId: string, data: CreateVariantInput) {
    await this.getProductById(productId);

    if (!data.attribute || !data.value) {
      const err = new Error('attribute and value are required for variant');
      (err as any).statusCode = 400;
      throw err;
    }

    return prisma.productVariant.create({
      data: {
        productId,
        attribute: data.attribute.trim(),
        value: data.value.trim(),
        extraPrice: data.extraPrice !== undefined ? Number(data.extraPrice) : 0
      }
    });
  }

  async getVariants(productId: string) {
    await this.getProductById(productId);

    return prisma.productVariant.findMany({
      where: { productId }
    });
  }

  async updateVariant(variantId: string, data: Partial<CreateVariantInput>) {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) {
      const err = new Error(`ProductVariant with ID '${variantId}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    return prisma.productVariant.update({
      where: { id: variantId },
      data: {
        attribute: data.attribute !== undefined ? data.attribute.trim() : undefined,
        value: data.value !== undefined ? data.value.trim() : undefined,
        extraPrice: data.extraPrice !== undefined ? Number(data.extraPrice) : undefined
      }
    });
  }

  async deleteVariant(variantId: string) {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) {
      const err = new Error(`ProductVariant with ID '${variantId}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    return prisma.productVariant.delete({ where: { id: variantId } });
  }

  // ============================================================================
  // 3. Price Resolution Endpoint
  // ============================================================================

  async resolveProductPrice(productId: string, customerTier?: string, targetCurrency?: string) {
    const product = await this.getProductById(productId);

    const tierUpper = customerTier ? customerTier.toUpperCase() : null;
    const currUpper = targetCurrency ? targetCurrency.toUpperCase() : product.currency.toUpperCase();

    // Look up PriceList override
    let priceListOverride = null;
    if (tierUpper) {
      priceListOverride = await prisma.priceList.findFirst({
        where: {
          productId,
          customerTier: tierUpper,
          currency: currUpper,
          isActive: true,
          overridePrice: { not: null }
        }
      });
    }

    if (priceListOverride && priceListOverride.overridePrice !== null) {
      return {
        productId,
        productName: product.name,
        customerTier: tierUpper,
        currency: currUpper,
        basePrice: product.basePrice,
        overridePrice: priceListOverride.overridePrice,
        resolvedPrice: priceListOverride.overridePrice,
        currencyConverted: false
      };
    }

    // Convert currency using flat FX conversion table
    const sourceRate = FX_RATES[product.currency.toUpperCase()] || 1.0;
    const targetRate = FX_RATES[currUpper] || 1.0;

    const rawConverted = product.basePrice * (targetRate / sourceRate);
    const resolvedPrice = Number(rawConverted.toFixed(2));
    const currencyConverted = currUpper !== product.currency.toUpperCase();

    return {
      productId,
      productName: product.name,
      customerTier: tierUpper,
      currency: currUpper,
      basePrice: product.basePrice,
      overridePrice: null,
      resolvedPrice,
      currencyConverted
    };
  }

  // ============================================================================
  // 4. Catalog Seeding Utility
  // ============================================================================

  async seedCatalog() {
    const sampleProducts = [
      // Hardware
      {
        sku: 'HW-SRV-01',
        name: 'Enterprise Rack Server',
        description: 'High performance dual-socket 2U rack server for enterprise workloads',
        category: 'Hardware',
        basePrice: 2500.00,
        unit: 'PCS',
        tax: 10.0,
        marginPercent: 30.0,
        currency: 'USD',
        variants: [
          { attribute: 'RAM', value: '64GB', extraPrice: 200 },
          { attribute: 'RAM', value: '128GB', extraPrice: 500 }
        ]
      },
      {
        sku: 'HW-WKS-01',
        name: 'Pro Workstation Laptop',
        description: 'Mobile workstation with dedicated GPU and color-accurate display',
        category: 'Hardware',
        basePrice: 1500.00,
        unit: 'PCS',
        tax: 10.0,
        marginPercent: 25.0,
        currency: 'USD',
        variants: [
          { attribute: 'Storage', value: '1TB SSD', extraPrice: 150 },
          { attribute: 'Storage', value: '2TB SSD', extraPrice: 350 }
        ]
      },
      {
        sku: 'HW-GW-01',
        name: 'Industrial IoT Gateway',
        description: 'Ruggedized IoT gateway with cellular backhaul and edge compute',
        category: 'Hardware',
        basePrice: 800.00,
        unit: 'PCS',
        tax: 10.0,
        marginPercent: 40.0,
        currency: 'USD'
      },

      // Services
      {
        sku: 'SV-IMP-01',
        name: 'Onsite Setup & Installation',
        description: 'Professional hardware rack assembly, networking setup, and verification',
        category: 'Services',
        basePrice: 1200.00,
        unit: 'HOURS',
        tax: 0.0,
        marginPercent: 60.0,
        currency: 'USD'
      },
      {
        sku: 'SV-MIG-01',
        name: 'Cloud Migration Service',
        description: 'End-to-end database and application cloud migration consultancy',
        category: 'Services',
        basePrice: 3000.00,
        unit: 'PROJECT',
        tax: 0.0,
        marginPercent: 65.0,
        currency: 'USD'
      },
      {
        sku: 'SV-SUP-01',
        name: '24/7 Premium Support Plan',
        description: 'Dedicated account manager, 15-minute response SLA, and hot-swap replacement',
        category: 'Services',
        basePrice: 500.00,
        unit: 'MONTHS',
        tax: 0.0,
        marginPercent: 70.0,
        currency: 'USD'
      },

      // Subscriptions
      {
        sku: 'SUB-SaaS-01',
        name: 'SaaS Cloud Enterprise License',
        description: 'Annual SaaS user license with advanced security analytics and API access',
        category: 'Subscriptions',
        basePrice: 150.00,
        unit: 'USER/MONTH',
        tax: 0.0,
        marginPercent: 85.0,
        currency: 'USD'
      },
      {
        sku: 'SUB-SEC-01',
        name: 'Security Threat Monitoring',
        description: 'Managed SIEM threat detection and automated response subscription',
        category: 'Subscriptions',
        basePrice: 250.00,
        unit: 'MONTHS',
        tax: 0.0,
        marginPercent: 80.0,
        currency: 'USD'
      },
      {
        sku: 'SUB-BKP-01',
        name: 'Managed Cloud Backup Plan',
        description: 'Automated encrypted offsite data backup with point-in-time recovery',
        category: 'Subscriptions',
        basePrice: 100.00,
        unit: 'MONTHS',
        tax: 0.0,
        marginPercent: 75.0,
        currency: 'USD'
      }
    ];

    const created = [];
    for (const p of sampleProducts) {
      const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
      if (!existing) {
        const prod = await this.createProduct(p);
        created.push(prod);
      } else {
        created.push(existing);
      }
    }

    return created;
  }
}

export const productsService = new ProductsService();
