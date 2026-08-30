export type Product = {
  id: string;
  user_id: string;
  name: string;
  price: number;
  /** Preço de custo (último custo pago). Null = não informado. */
  cost_price: number | null;
  track_stock: boolean;
  stock_quantity: number | null;
  created_at: string;
  updated_at: string;
};

export type ProductWithBarcodes = Product & { barcodes: string[] };

/** Categoria de produto, criada pelo próprio dono no cadastro. */
export type ProductTag = {
  id: string;
  name: string;
};

export type ProductWithTags = ProductWithBarcodes & { tags: ProductTag[] };

export type SaleItemInput = {
  product_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
};
