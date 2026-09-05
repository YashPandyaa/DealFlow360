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

export interface StockInput {
  warehouseId: string;
  quantity: number;
  reorderLevel?: number;
}

export interface CreateProductInput {
  sku?: string;
  name: string;
  description?: string;
  category?: string;
  basePrice: number;
  costPrice?: number;
  unit?: string;
  tax?: number;
  marginPercent?: number;
  currency?: string;
  productType?: string; // PHYSICAL, DIGITAL, SERVICE, SUBSCRIPTION
  billingType?: string; // ONE_TIME, RECURRING
  status?: string; // ACTIVE, INACTIVE
  subscriptionPlanId?: string;
  variants?: CreateVariantInput[];
  stocks?: StockInput[];
}

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  basePrice?: number;
  costPrice?: number;
  unit?: string;
  tax?: number;
  marginPercent?: number;
  currency?: string;
  productType?: string;
  billingType?: string;
  status?: string;
  subscriptionPlanId?: string;
}

export interface GetProductsFilter {
  category?: string;
  search?: string;
  status?: string;
  billingType?: string;
}

export interface CreatePriceListInput {
  name: string;
  customerTier?: string;
  currency?: string;
  productId?: string;
  overridePrice?: number;
  effectiveDate?: Date | string;
  description?: string;
  isActive?: boolean;
  items?: Array<{ productId: string; price: number }>;
}

export class ProductsService {
  // ============================================================================
  // 1. Category Management
  // ============================================================================

  async ensureCategoriesSeeded() {
    const defaultCategories = [
      { name: 'Hardware', description: 'Physical IT equipment, servers, laptops, and networking devices', defaultCeiling: 15 },
      { name: 'Software', description: 'Software packages, perpetual licenses, and operating systems', defaultCeiling: 10 },
      { name: 'Services', description: 'Professional consulting, setup, installation, and support services', defaultCeiling: 5 },
      { name: 'Subscription', description: 'Recurring SaaS plans and cloud subscriptions', defaultCeiling: 10 },
      { name: 'Subscriptions', description: 'Recurring SaaS plans and cloud subscriptions', defaultCeiling: 10 }
    ];

    for (const cat of defaultCategories) {
      const existingCat = await prisma.category.findUnique({ where: { name: cat.name } }).catch(() => null);
      if (!existingCat) {
        await prisma.category.create({
          data: { name: cat.name, description: cat.description }
        }).catch(() => {});
      }

      // Also ensure CategoryDiscountCeiling exists in discount governance module
      const existingCeiling = await prisma.categoryDiscountCeiling.findUnique({ where: { category: cat.name } }).catch(() => null);
      if (!existingCeiling) {
        await prisma.categoryDiscountCeiling.create({
          data: { category: cat.name, maxDiscountPercent: cat.defaultCeiling }
        }).catch(() => {});
      }
    }
  }

  async getCategories() {
    await this.ensureCategoriesSeeded();
    return prisma.category.findMany({
      orderBy: { name: 'asc' }
    });
  }

  async createCategory(name: string, description?: string) {
    if (!name || name.trim() === '') {
      const err = new Error('Category name is required');
      (err as any).statusCode = 400;
      throw err;
    }

    const trimmedName = name.trim();
    const existing = await prisma.category.findUnique({ where: { name: trimmedName } });
    if (existing) {
      const err = new Error(`Category '${trimmedName}' already exists`);
      (err as any).statusCode = 409;
      throw err;
    }

    return prisma.category.create({
      data: {
        name: trimmedName,
        description: description || null
      }
    });
  }

  // ============================================================================
  // 2. Product CRUD & Validation
  // ============================================================================

  async createProduct(data: CreateProductInput) {
    await this.ensureCategoriesSeeded();

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

    const costPrice = data.costPrice !== undefined ? Number(data.costPrice) : 0;
    if (typeof costPrice !== 'number' || costPrice < 0) {
      const err = new Error('costPrice must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    const tax = data.tax !== undefined ? Number(data.tax) : 0;
    if (typeof tax !== 'number' || tax < 0) {
      const err = new Error('tax must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    const billingType = data.billingType ? data.billingType.toUpperCase() : 'ONE_TIME';
    if (!['ONE_TIME', 'RECURRING'].includes(billingType)) {
      const err = new Error("billingType must be 'ONE_TIME' or 'RECURRING'");
      (err as any).statusCode = 400;
      throw err;
    }

    let subPlanId = data.subscriptionPlanId || null;
    if (billingType === 'RECURRING') {
      if (!subPlanId) {
        // Look up default matching subscription plan or create a default plan
        const defaultPlan = await prisma.subscriptionPlan.findFirst({
          where: { isActive: true }
        });
        if (defaultPlan) {
          subPlanId = defaultPlan.id;
        } else {
          // Auto-create default Monthly plan for this product
          const newPlan = await prisma.subscriptionPlan.create({
            data: {
              name: `${data.name.trim()} Monthly Plan`,
              billingCycle: 'MONTHLY',
              pricePerCycle: data.basePrice,
              isActive: true
            }
          });
          subPlanId = newPlan.id;
        }
      } else {
        const planExists = await prisma.subscriptionPlan.findUnique({ where: { id: subPlanId } });
        if (!planExists) {
          const err = new Error(`SubscriptionPlan with ID '${subPlanId}' not found`);
          (err as any).statusCode = 400;
          throw err;
        }
      }
    }

    const sku = data.sku ? data.sku.trim() : `SKU-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const existingSku = await prisma.product.findUnique({ where: { sku } });
    if (existingSku) {
      const err = new Error(`Product with SKU '${sku}' already exists`);
      (err as any).statusCode = 409;
      throw err;
    }

    // Dynamic margin percentage calculation: ((Selling Price - Cost Price) / Selling Price) * 100
    let marginPercent = data.marginPercent !== undefined ? Number(data.marginPercent) : 0;
    if (data.basePrice > 0 && costPrice >= 0 && data.marginPercent === undefined) {
      marginPercent = Number((((data.basePrice - costPrice) / data.basePrice) * 100).toFixed(2));
    }

    const product = await prisma.product.create({
      data: {
        sku,
        name: data.name.trim(),
        description: data.description || null,
        category: data.category ? data.category.trim() : 'Hardware',
        basePrice: Number(data.basePrice),
        costPrice,
        unit: data.unit || 'PCS',
        tax,
        marginPercent: Math.max(0, marginPercent),
        currency: data.currency ? data.currency.toUpperCase() : 'USD',
        productType: data.productType ? data.productType.toUpperCase() : 'PHYSICAL',
        billingType,
        status: data.status ? data.status.toUpperCase() : 'ACTIVE',
        subscriptionPlanId: subPlanId,
        variants: data.variants && data.variants.length > 0 ? {
          create: data.variants.map(v => ({
            attribute: v.attribute.trim(),
            value: v.value.trim(),
            extraPrice: v.extraPrice !== undefined ? Number(v.extraPrice) : 0
          }))
        } : undefined
      },
      include: {
        variants: true,
        priceLists: true,
        warehouseStock: {
          include: { warehouse: true }
        },
        subscriptionPlan: true
      }
    });

    // Initialize stock records across specified warehouses or default warehouses
    if (data.stocks && data.stocks.length > 0) {
      for (const st of data.stocks) {
        if (st.quantity < 0) {
          const err = new Error('Stock quantity cannot be negative');
          (err as any).statusCode = 400;
          throw err;
        }
        await prisma.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: st.warehouseId, productId: product.id } },
          create: {
            warehouseId: st.warehouseId,
            productId: product.id,
            quantity: Number(st.quantity),
            reorderLevel: st.reorderLevel !== undefined ? Number(st.reorderLevel) : 10
          },
          update: {
            quantity: Number(st.quantity),
            reorderLevel: st.reorderLevel !== undefined ? Number(st.reorderLevel) : undefined
          }
        });
      }
    } else {
      // Auto-create stock entries for all active warehouses with 0 initial stock
      const activeWarehouses = await prisma.warehouse.findMany({ where: { isActive: true } }).catch(() => []);
      for (const wh of activeWarehouses) {
        await prisma.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: wh.id, productId: product.id } },
          create: {
            warehouseId: wh.id,
            productId: product.id,
            quantity: 0,
            reorderLevel: 10
          },
          update: {}
        }).catch(() => {});
      }
    }

    return this.getProductById(product.id);
  }

  async ensureProductsSeeded() {
    try {
      const count = await prisma.product.count().catch(() => 0);
      if (count === 0) {
        await this.seedCatalog();
      }
    } catch (e) {}
  }

  async getProducts(filter?: GetProductsFilter) {
    await this.ensureProductsSeeded();

    const where: any = {};

    if (filter?.category && filter.category !== 'ALL') {
      where.category = {
        equals: filter.category
      };
    }

    if (filter?.status && filter.status !== 'ALL') {
      where.status = filter.status.toUpperCase();
    } else if (!filter?.status) {
      // By default list active products unless explicitly set to ALL or INACTIVE
      where.status = 'ACTIVE';
    }

    if (filter?.billingType && filter.billingType !== 'ALL') {
      where.billingType = filter.billingType.toUpperCase();
    }

    if (filter?.search) {
      const query = filter.search.trim();
      where.OR = [
        { name: { contains: query } },
        { sku: { contains: query } },
        { description: { contains: query } },
        { category: { contains: query } }
      ];
    }

    return prisma.product.findMany({
      where,
      include: {
        variants: true,
        priceLists: true,
        warehouseStock: {
          include: { warehouse: true }
        },
        subscriptionPlan: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getProductById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        priceLists: {
          include: { items: true }
        },
        warehouseStock: {
          include: { warehouse: true }
        },
        subscriptionPlan: true
      }
    });

    if (!product) {
      const err = new Error(`Product with ID '${id}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    // Compute stock totals for easy client consumption
    const totalOnHand = product.warehouseStock.reduce((acc, curr) => acc + curr.quantity, 0);
    const totalAllocated = product.warehouseStock.reduce((acc, curr) => acc + curr.allocatedQty, 0);
    const totalReserved = product.warehouseStock.reduce((acc, curr) => acc + curr.reservedQty, 0);
    const totalAvailable = Math.max(0, totalOnHand - totalReserved);

    return {
      ...product,
      stockSummary: {
        totalOnHand,
        totalAllocated,
        totalReserved,
        totalAvailable
      }
    };
  }

  async updateProduct(id: string, data: UpdateProductInput) {
    const existing = await this.getProductById(id);

    if (data.sku && data.sku.trim() !== existing.sku) {
      const duplicateSku = await prisma.product.findUnique({ where: { sku: data.sku.trim() } });
      if (duplicateSku && duplicateSku.id !== id) {
        const err = new Error(`Product with SKU '${data.sku.trim()}' already exists`);
        (err as any).statusCode = 409;
        throw err;
      }
    }

    if (data.basePrice !== undefined && (typeof data.basePrice !== 'number' || data.basePrice < 0)) {
      const err = new Error('basePrice must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    if (data.costPrice !== undefined && (typeof data.costPrice !== 'number' || data.costPrice < 0)) {
      const err = new Error('costPrice must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    if (data.tax !== undefined && (typeof data.tax !== 'number' || data.tax < 0)) {
      const err = new Error('tax must be a non-negative number');
      (err as any).statusCode = 400;
      throw err;
    }

    if (data.billingType) {
      const bt = data.billingType.toUpperCase();
      if (!['ONE_TIME', 'RECURRING'].includes(bt)) {
        const err = new Error("billingType must be 'ONE_TIME' or 'RECURRING'");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    if (data.status) {
      const st = data.status.toUpperCase();
      if (!['ACTIVE', 'INACTIVE'].includes(st)) {
        const err = new Error("status must be 'ACTIVE' or 'INACTIVE'");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    const updatedBasePrice = data.basePrice !== undefined ? Number(data.basePrice) : existing.basePrice;
    const updatedCostPrice = data.costPrice !== undefined ? Number(data.costPrice) : existing.costPrice;
    let marginPercent = data.marginPercent !== undefined ? Number(data.marginPercent) : existing.marginPercent;

    if ((data.basePrice !== undefined || data.costPrice !== undefined) && updatedBasePrice > 0) {
      marginPercent = Number((((updatedBasePrice - updatedCostPrice) / updatedBasePrice) * 100).toFixed(2));
    }

    await prisma.product.update({
      where: { id },
      data: {
        sku: data.sku ? data.sku.trim() : undefined,
        name: data.name !== undefined ? data.name.trim() : undefined,
        description: data.description !== undefined ? data.description : undefined,
        category: data.category !== undefined ? data.category.trim() : undefined,
        basePrice: data.basePrice !== undefined ? Number(data.basePrice) : undefined,
        costPrice: data.costPrice !== undefined ? Number(data.costPrice) : undefined,
        unit: data.unit !== undefined ? data.unit : undefined,
        tax: data.tax !== undefined ? Number(data.tax) : undefined,
        marginPercent: Math.max(0, marginPercent),
        currency: data.currency ? data.currency.toUpperCase() : undefined,
        productType: data.productType ? data.productType.toUpperCase() : undefined,
        billingType: data.billingType ? data.billingType.toUpperCase() : undefined,
        status: data.status ? data.status.toUpperCase() : undefined,
        subscriptionPlanId: data.subscriptionPlanId !== undefined ? data.subscriptionPlanId : undefined
      }
    });

    return this.getProductById(id);
  }

  async deleteProduct(id: string) {
    await this.getProductById(id);

    // Referential integrity checks
    const quotationLineCount = await prisma.quotationLine.count({ where: { productId: id } });
    const salesOrderLineCount = await prisma.salesOrderLine.count({ where: { productId: id } });
    const priceListCount = await prisma.priceList.count({ where: { productId: id } });

    if (quotationLineCount > 0 || salesOrderLineCount > 0 || priceListCount > 0) {
      const err = new Error(`Cannot delete product '${id}' because it is referenced in existing quotations or price lists`);
      (err as any).statusCode = 409;
      throw err;
    }

    return prisma.product.delete({ where: { id } });
  }

  // ============================================================================
  // 3. Product Variant CRUD
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
  // 4. Price List CRUD & Price Resolution
  // ============================================================================

  async createPriceList(data: CreatePriceListInput) {
    if (!data.name || data.name.trim() === '') {
      const err = new Error('PriceList name is required');
      (err as any).statusCode = 400;
      throw err;
    }

    const priceList = await prisma.priceList.create({
      data: {
        name: data.name.trim(),
        customerTier: data.customerTier ? data.customerTier.toUpperCase() : null,
        currency: data.currency ? data.currency.toUpperCase() : 'USD',
        productId: data.productId || null,
        overridePrice: data.overridePrice !== undefined ? Number(data.overridePrice) : null,
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
        description: data.description || null,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
        items: data.items && data.items.length > 0 ? {
          create: data.items.map(item => ({
            productId: item.productId,
            price: Number(item.price),
            isActive: true
          }))
        } : undefined
      },
      include: {
        items: true,
        product: true
      }
    });

    return priceList;
  }

  async getPriceLists(filter?: { customerTier?: string; productId?: string; currency?: string }) {
    const where: any = {};
    if (filter?.customerTier) where.customerTier = filter.customerTier.toUpperCase();
    if (filter?.productId) where.productId = filter.productId;
    if (filter?.currency) where.currency = filter.currency.toUpperCase();

    return prisma.priceList.findMany({
      where,
      include: {
        items: {
          include: {
            priceList: true
          }
        },
        product: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async deletePriceList(id: string) {
    const existing = await prisma.priceList.findUnique({ where: { id } });
    if (!existing) {
      const err = new Error(`PriceList with ID '${id}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    return prisma.priceList.delete({ where: { id } });
  }

  async resolveProductPrice(productId: string, customerTier?: string, targetCurrency?: string, variantId?: string) {
    const product = await this.getProductById(productId);

    let baseSellingPrice = product.basePrice;
    let selectedVariantName: string | null = null;
    let variantExtraPrice = 0;

    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (variant && variant.productId === productId) {
        variantExtraPrice = variant.extraPrice;
        baseSellingPrice += variantExtraPrice;
        selectedVariantName = `${variant.attribute}: ${variant.value}`;
      }
    }

    const tierUpper = customerTier ? customerTier.toUpperCase() : null;
    const currUpper = targetCurrency ? targetCurrency.toUpperCase() : product.currency.toUpperCase();

    // 1. Look up PriceList override by productId + customerTier + currency
    let overridePrice: number | null = null;
    let priceListName: string | null = null;

    if (tierUpper) {
      const priceListOverride = await prisma.priceList.findFirst({
        where: {
          productId,
          customerTier: tierUpper,
          currency: currUpper,
          isActive: true,
          overridePrice: { not: null }
        }
      });

      if (priceListOverride && priceListOverride.overridePrice !== null) {
        overridePrice = priceListOverride.overridePrice + variantExtraPrice;
        priceListName = priceListOverride.name;
      } else {
        // Also check PriceListItem inside multi-item price lists
        const listItem = await prisma.priceListItem.findFirst({
          where: {
            productId,
            isActive: true,
            priceList: {
              customerTier: tierUpper,
              currency: currUpper,
              isActive: true
            }
          },
          include: { priceList: true }
        });

        if (listItem) {
          overridePrice = listItem.price + variantExtraPrice;
          priceListName = listItem.priceList.name;
        }
      }
    }

    if (overridePrice !== null) {
      return {
        productId,
        productName: product.name,
        customerTier: tierUpper,
        currency: currUpper,
        basePrice: product.basePrice,
        costPrice: product.costPrice,
        variantId: variantId || null,
        variantName: selectedVariantName,
        variantExtraPrice,
        overridePrice,
        resolvedPrice: Number(overridePrice.toFixed(2)),
        priceListName,
        currencyConverted: false
      };
    }

    // 2. Convert currency using flat FX conversion table if target currency differs
    const sourceRate = FX_RATES[product.currency.toUpperCase()] || 1.0;
    const targetRate = FX_RATES[currUpper] || 1.0;

    const rawConverted = baseSellingPrice * (targetRate / sourceRate);
    const resolvedPrice = Number(rawConverted.toFixed(2));
    const currencyConverted = currUpper !== product.currency.toUpperCase();

    return {
      productId,
      productName: product.name,
      customerTier: tierUpper,
      currency: currUpper,
      basePrice: product.basePrice,
      costPrice: product.costPrice,
      variantId: variantId || null,
      variantName: selectedVariantName,
      variantExtraPrice,
      overridePrice: null,
      resolvedPrice,
      priceListName: null,
      currencyConverted
    };
  }

  // ============================================================================
  // 5. Product Warehouse Stock Operations
  // ============================================================================

  async updateProductWarehouseStock(productId: string, warehouseId: string, quantity: number, reorderLevel?: number) {
    await this.getProductById(productId);

    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) {
      const err = new Error(`Warehouse with ID '${warehouseId}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    if (typeof quantity !== 'number' || quantity < 0) {
      const err = new Error('Stock quantity cannot be negative');
      (err as any).statusCode = 400;
      throw err;
    }

    const stockRecord = await prisma.warehouseStock.upsert({
      where: {
        warehouseId_productId: { warehouseId, productId }
      },
      create: {
        warehouseId,
        productId,
        quantity: Number(quantity),
        reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : 10
      },
      update: {
        quantity: Number(quantity),
        reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : undefined
      },
      include: {
        warehouse: true
      }
    });

    const availableQty = Math.max(0, stockRecord.quantity - stockRecord.reservedQty);

    return {
      ...stockRecord,
      availableQty
    };
  }

  // ============================================================================
  // 6. Catalog Seeding Utility
  // ============================================================================

  async seedCatalog() {
    await this.ensureCategoriesSeeded();

    // Ensure default warehouses exist
    let mainWh = await prisma.warehouse.findUnique({ where: { code: 'WH-MAIN' } }).catch(() => null);
    if (!mainWh) {
      mainWh = await prisma.warehouse.create({
        data: { name: 'Main Distribution Center', code: 'WH-MAIN', location: 'Seattle, WA', capacity: 10000, shippingCostWeighting: 1.0, replenishmentThreshold: 10 }
      });
    }

    let eastWh = await prisma.warehouse.findUnique({ where: { code: 'WH-EAST' } }).catch(() => null);
    if (!eastWh) {
      eastWh = await prisma.warehouse.create({
        data: { name: 'East Coast Depot', code: 'WH-EAST', location: 'Boston, MA', capacity: 5000, shippingCostWeighting: 1.2, replenishmentThreshold: 10 }
      });
    }

    // Ensure default subscription plan exists
    let monthlyPlan = await prisma.subscriptionPlan.findFirst({ where: { billingCycle: 'MONTHLY' } }).catch(() => null);
    if (!monthlyPlan) {
      monthlyPlan = await prisma.subscriptionPlan.create({
        data: { name: 'Monthly Enterprise Plan', billingCycle: 'MONTHLY', pricePerCycle: 5000, isActive: true }
      });
    }

    const sampleProducts: CreateProductInput[] = [
      // Required Test Products
      {
        sku: 'HW-MBP-01',
        name: 'MacBook Pro',
        description: 'Apple M3 Max 16-inch Laptop for High Performance Engineering',
        category: 'Hardware',
        basePrice: 120000,
        costPrice: 90000,
        unit: 'PCS',
        tax: 18.0,
        currency: 'INR',
        productType: 'PHYSICAL',
        billingType: 'ONE_TIME',
        status: 'ACTIVE',
        variants: [
          { attribute: 'RAM', value: '16 GB', extraPrice: 10000 },
          { attribute: 'RAM', value: '32 GB', extraPrice: 20000 }
        ],
        stocks: [
          { warehouseId: mainWh.id, quantity: 10, reorderLevel: 5 },
          { warehouseId: eastWh.id, quantity: 5, reorderLevel: 2 }
        ]
      },
      {
        sku: 'SUB-SAAS-PRO',
        name: 'SaaS Pro',
        description: 'Enterprise Cloud SaaS Subscription with Dedicated Support',
        category: 'Services',
        basePrice: 5000,
        costPrice: 1000,
        unit: 'MONTHLY',
        tax: 18.0,
        currency: 'INR',
        productType: 'SERVICE',
        billingType: 'RECURRING',
        status: 'ACTIVE',
        subscriptionPlanId: monthlyPlan.id,
        stocks: [
          { warehouseId: mainWh.id, quantity: 9999, reorderLevel: 10 }
        ]
      },
      {
        sku: 'HW-SRV-01',
        name: 'Enterprise Rack Server',
        description: 'High performance dual-socket 2U rack server for enterprise workloads',
        category: 'Hardware',
        basePrice: 2500.00,
        costPrice: 1750.00,
        unit: 'PCS',
        tax: 10.0,
        marginPercent: 30.0,
        currency: 'USD',
        productType: 'PHYSICAL',
        billingType: 'ONE_TIME',
        status: 'ACTIVE',
        variants: [
          { attribute: 'RAM', value: '64GB', extraPrice: 200 },
          { attribute: 'RAM', value: '128GB', extraPrice: 500 }
        ],
        stocks: [
          { warehouseId: mainWh.id, quantity: 20, reorderLevel: 5 }
        ]
      },
      {
        sku: 'HW-WKS-01',
        name: 'Pro Workstation Laptop',
        description: 'Mobile workstation laptop with dedicated GPU and color-accurate display',
        category: 'Hardware',
        basePrice: 1500.00,
        costPrice: 1125.00,
        unit: 'PCS',
        tax: 10.0,
        marginPercent: 25.0,
        currency: 'USD',
        productType: 'PHYSICAL',
        billingType: 'ONE_TIME',
        status: 'ACTIVE',
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
        costPrice: 480.00,
        unit: 'PCS',
        tax: 10.0,
        marginPercent: 40.0,
        currency: 'USD',
        productType: 'PHYSICAL',
        billingType: 'ONE_TIME',
        status: 'ACTIVE'
      },
      {
        sku: 'SV-IMP-01',
        name: 'Onsite Setup & Installation',
        description: 'Professional hardware rack assembly, networking setup, and verification',
        category: 'Services',
        basePrice: 1200.00,
        costPrice: 480.00,
        unit: 'HOURS',
        tax: 0.0,
        marginPercent: 60.0,
        currency: 'USD',
        productType: 'SERVICE',
        billingType: 'ONE_TIME',
        status: 'ACTIVE'
      },
      {
        sku: 'SV-MIG-01',
        name: 'Cloud Migration Service',
        description: 'End-to-end database and application cloud migration consultancy',
        category: 'Services',
        basePrice: 3000.00,
        costPrice: 1050.00,
        unit: 'PROJECT',
        tax: 0.0,
        marginPercent: 65.0,
        currency: 'USD',
        productType: 'SERVICE',
        billingType: 'ONE_TIME',
        status: 'ACTIVE'
      },
      {
        sku: 'SV-SUP-01',
        name: '24/7 Premium Support Plan',
        description: 'Dedicated account manager, 15-minute response SLA, and hot-swap replacement',
        category: 'Services',
        basePrice: 500.00,
        costPrice: 150.00,
        unit: 'MONTHS',
        tax: 0.0,
        marginPercent: 70.0,
        currency: 'USD',
        productType: 'SERVICE',
        billingType: 'ONE_TIME',
        status: 'ACTIVE'
      },
      {
        sku: 'SUB-SaaS-01',
        name: 'SaaS Cloud Enterprise License',
        description: 'Annual SaaS user license with advanced security analytics and API access',
        category: 'Subscriptions',
        basePrice: 150.00,
        costPrice: 22.50,
        unit: 'USER/MONTH',
        tax: 0.0,
        marginPercent: 85.0,
        currency: 'USD',
        productType: 'SERVICE',
        billingType: 'RECURRING',
        status: 'ACTIVE',
        subscriptionPlanId: monthlyPlan.id
      },
      {
        sku: 'SUB-SEC-01',
        name: 'Security Threat Monitoring',
        description: 'Managed SIEM threat detection and automated response subscription',
        category: 'Subscription',
        basePrice: 250.00,
        costPrice: 50.00,
        unit: 'MONTHS',
        tax: 0.0,
        marginPercent: 80.0,
        currency: 'USD',
        productType: 'SERVICE',
        billingType: 'RECURRING',
        status: 'ACTIVE',
        subscriptionPlanId: monthlyPlan.id
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
