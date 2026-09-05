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
// 1. GET /products (List with category and search filters)
// ============================================================================
productsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const category = req.query.category ? getParamString(req.query.category as any) : undefined;
    const search = req.query.search ? getParamString(req.query.search as any) : undefined;

    let products = await productsService.getProducts({ category, search });
    if (getUserRole(req) === 'CUSTOMER') {
      products = sanitizeForCustomer(products);
    }
    res.status(200).json(products);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 2. POST /products (Admin Only - Create product with optional variants)
// ============================================================================
productsRouter.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { sku, name, description, category, basePrice, unit, tax, marginPercent, currency, variants } = req.body;

    const product = await productsService.createProduct({
      sku,
      name,
      description,
      category,
      basePrice: basePrice !== undefined ? Number(basePrice) : basePrice,
      unit,
      tax: tax !== undefined ? Number(tax) : tax,
      marginPercent: marginPercent !== undefined ? Number(marginPercent) : marginPercent,
      currency,
      variants
    });

    res.status(201).json(product);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 3. GET /products/:id/price (Price Resolution)
// ============================================================================
productsRouter.get('/:id/price', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const customerTier = req.query.customerTier ? getParamString(req.query.customerTier as any) : undefined;
    const currency = req.query.currency ? getParamString(req.query.currency as any) : undefined;

    const priceResult = await productsService.resolveProductPrice(id, customerTier, currency);
    res.status(200).json(priceResult);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 4. Variant Endpoints (/products/:id/variants)
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
// 5. GET /products/:id
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
// 6. PATCH/PUT /products/:id (Admin Only)
// ============================================================================
const handleUpdateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { sku, name, description, category, basePrice, unit, tax, marginPercent, currency } = req.body;

    const updated = await productsService.updateProduct(id, {
      sku,
      name,
      description,
      category,
      basePrice: basePrice !== undefined ? Number(basePrice) : basePrice,
      unit,
      tax: tax !== undefined ? Number(tax) : tax,
      marginPercent: marginPercent !== undefined ? Number(marginPercent) : marginPercent,
      currency
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
// 7. DELETE /products/:id (Admin Only)
// ============================================================================
productsRouter.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    await productsService.deleteProduct(id);
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});
