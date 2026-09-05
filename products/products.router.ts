// products/products.router.ts
import { Router, Request, Response } from 'express';
import { productsService } from './products.service';
import { authenticate, requireRole } from '../auth/auth.middleware';

export const productsRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================================
// 1. GET /products (List with category and search filters)
// ============================================================================
productsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const category = req.query.category ? getParamString(req.query.category as any) : undefined;
    const search = req.query.search ? getParamString(req.query.search as any) : undefined;

    const products = await productsService.getProducts({ category, search });
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
    const product = await productsService.getProductById(id);
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
