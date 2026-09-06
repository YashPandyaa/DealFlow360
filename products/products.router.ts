// products/products.router.ts
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { productsService } from './products.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../auth/auth.middleware';
import { sanitizeForCustomer } from '../shared/auth.sanitizer';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

export const productsRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

const getUserRole = (req: Request): string | undefined => {
  const authUser = (req as AuthenticatedRequest).user;
  if (authUser?.role) return authUser.role;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return decoded.role;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

// ============================================================================
// 1. Categories Endpoints (/products/categories)
// ============================================================================
productsRouter.get('/categories', async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await productsService.getCategories();
    res.status(200).json(categories);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

productsRouter.post('/categories', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    const category = await productsService.createCategory(name, description);
    res.status(201).json(category);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 2. Price List Endpoints (/products/price-lists)
// ============================================================================
productsRouter.get('/price-lists', async (req: Request, res: Response): Promise<void> => {
  try {
    const customerTier = req.query.customerTier ? getParamString(req.query.customerTier as any) : undefined;
    const productId = req.query.productId ? getParamString(req.query.productId as any) : undefined;
    const currency = req.query.currency ? getParamString(req.query.currency as any) : undefined;

    const lists = await productsService.getPriceLists({ customerTier, productId, currency });
    res.status(200).json(lists);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

productsRouter.post('/price-lists', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, customerTier, currency, productId, overridePrice, effectiveDate, description, isActive, items } = req.body;

    const priceList = await productsService.createPriceList({
      name,
      customerTier,
      currency,
      productId,
      overridePrice,
      effectiveDate,
      description,
      isActive,
      items
    });

    res.status(201).json(priceList);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

productsRouter.delete('/price-lists/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    await productsService.deletePriceList(id);
    res.status(200).json({ message: 'PriceList deleted successfully' });
  } catch (error: any) {
    const status = error.statusCode || 404;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 3. GET /products (List with filters)
// ============================================================================
productsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const category = req.query.category ? getParamString(req.query.category as any) : undefined;
    const search = req.query.search ? getParamString(req.query.search as any) : undefined;
    const statusFilter = req.query.status ? getParamString(req.query.status as any) : undefined;
    const billingType = req.query.billingType ? getParamString(req.query.billingType as any) : undefined;

    const role = getUserRole(req);
    // Non-admin roles default to listing ACTIVE products only
    const status = (role === 'ADMIN' || role === 'FINANCE_OPERATIONS') ? (statusFilter || 'ALL') : (statusFilter || 'ACTIVE');

    let products = await productsService.getProducts({ category, search, status, billingType });
    if (role === 'CUSTOMER') {
      products = sanitizeForCustomer(products);
    }
    res.status(200).json(products);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 4. POST /products (Admin Only - Create Product)
// ============================================================================
productsRouter.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      sku,
      name,
      description,
      category,
      basePrice,
      costPrice,
      unit,
      tax,
      marginPercent,
      currency,
      productType,
      billingType,
      status,
      subscriptionPlanId,
      variants,
      stocks
    } = req.body;

    const product = await productsService.createProduct({
      sku,
      name,
      description,
      category,
      basePrice: basePrice !== undefined ? Number(basePrice) : basePrice,
      costPrice: costPrice !== undefined ? Number(costPrice) : costPrice,
      unit,
      tax: tax !== undefined ? Number(tax) : tax,
      marginPercent: marginPercent !== undefined ? Number(marginPercent) : marginPercent,
      currency,
      productType,
      billingType,
      status,
      subscriptionPlanId,
      variants,
      stocks
    });

    res.status(201).json(product);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 5. Price Resolution Endpoint (/products/:id/price)
// ============================================================================
productsRouter.get('/:id/price', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const customerTier = req.query.customerTier ? getParamString(req.query.customerTier as any) : undefined;
    const currency = req.query.currency ? getParamString(req.query.currency as any) : undefined;
    const variantId = req.query.variantId ? getParamString(req.query.variantId as any) : undefined;

    const priceResult = await productsService.resolveProductPrice(id, customerTier, currency, variantId);
    res.status(200).json(priceResult);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 6. Product Stock Endpoint (/products/:id/stock)
// ============================================================================
productsRouter.post('/:id/stock', authenticate, requireRole(['ADMIN', 'FINANCE_OPERATIONS']), async (req: Request, res: Response): Promise<void> => {
  try {
    const productId = getParamString(req.params.id);
    const { warehouseId, quantity, reorderLevel } = req.body;

    if (!warehouseId) {
      res.status(400).json({ error: 'warehouseId is required' });
      return;
    }

    const updatedStock = await productsService.updateProductWarehouseStock(
      productId,
      warehouseId,
      Number(quantity),
      reorderLevel !== undefined ? Number(reorderLevel) : undefined
    );

    res.status(200).json(updatedStock);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 7. Variant Endpoints (/products/:id/variants)
// ============================================================================
productsRouter.get('/:id/variants', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const variants = await productsService.getVariants(id);
    res.status(200).json(variants);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

productsRouter.post('/:id/variants', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { attribute, value, extraPrice } = req.body;

    const variant = await productsService.createVariant(id, {
      attribute,
      value,
      extraPrice: extraPrice !== undefined ? Number(extraPrice) : extraPrice
    });

    res.status(201).json(variant);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

const handleUpdateVariant = async (req: Request, res: Response): Promise<void> => {
  try {
    const variantId = getParamString(req.params.variantId);
    const { attribute, value, extraPrice } = req.body;

    const updated = await productsService.updateVariant(variantId, {
      attribute,
      value,
      extraPrice: extraPrice !== undefined ? Number(extraPrice) : extraPrice
    });

    res.status(200).json(updated);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
};

productsRouter.patch('/:id/variants/:variantId', authenticate, requireRole(['ADMIN']), handleUpdateVariant);
productsRouter.put('/:id/variants/:variantId', authenticate, requireRole(['ADMIN']), handleUpdateVariant);

productsRouter.delete('/:id/variants/:variantId', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const variantId = getParamString(req.params.variantId);
    await productsService.deleteVariant(variantId);
    res.status(200).json({ message: 'Variant deleted successfully' });
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 8. GET /products/:id
// ============================================================================
productsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    let product = await productsService.getProductById(id);
    if (getUserRole(req) === 'CUSTOMER') {
      product = sanitizeForCustomer(product);
    }
    res.status(200).json(product);
  } catch (error: any) {
    const status = error.statusCode || 404;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 9. PATCH/PUT /products/:id (Admin Only)
// ============================================================================
const handleUpdateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const {
      sku,
      name,
      description,
      category,
      basePrice,
      costPrice,
      unit,
      tax,
      marginPercent,
      currency,
      productType,
      billingType,
      status,
      subscriptionPlanId
    } = req.body;

    const updated = await productsService.updateProduct(id, {
      sku,
      name,
      description,
      category,
      basePrice: basePrice !== undefined ? Number(basePrice) : basePrice,
      costPrice: costPrice !== undefined ? Number(costPrice) : costPrice,
      unit,
      tax: tax !== undefined ? Number(tax) : tax,
      marginPercent: marginPercent !== undefined ? Number(marginPercent) : marginPercent,
      currency,
      productType,
      billingType,
      status,
      subscriptionPlanId
    });

    res.status(200).json(updated);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
};

productsRouter.patch('/:id', authenticate, requireRole(['ADMIN']), handleUpdateProduct);
productsRouter.put('/:id', authenticate, requireRole(['ADMIN']), handleUpdateProduct);

// ============================================================================
// 10. DELETE /products/:id (Admin Only)
// ============================================================================
productsRouter.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const force = req.query.force === 'true' || req.query.archive === 'true';
    const result = await productsService.deleteProduct(id, force);
    res.status(200).json(result);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});
