import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { SkeletonCard } from '../components/SkeletonLoader';
import {
  useCategories,
  useCreateCategory,
  useCreateProduct,
  useDeleteCategory,
  useDeleteProduct,
  useProducts,
  useUpdateCategory,
  useUpdateProduct,
} from '../hooks/useMenu';
import { formatCOP, ToastState, type Category, type Product } from '../lib/types';

interface Props {
  onToast: (msg: string, type: ToastState['type']) => void;
  onLogout: () => void;
}

type ModalType = 'category' | 'product' | null;

export function MenuPage({ onToast, onLogout }: Props) {
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const isLoading = productsLoading || categoriesLoading;

  const toggleExpand = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleSaveProduct = async (data: Omit<Product, 'createdAt' | 'updatedAt'>) => {
    try {
      if (editingProduct) {
        await updateProduct.mutateAsync({ id: editingProduct.id, data });
        onToast('Producto actualizado', 'success');
      } else {
        await createProduct.mutateAsync(data);
        onToast('Producto creado', 'success');
      }
      setModalType(null);
      setEditingProduct(null);
    } catch {
      onToast('No se pudo guardar el producto.', 'error');
    }
  };

  const handleSaveCategory = async (data: Omit<Category, 'createdAt'>) => {
    try {
      if (editingCategory) {
        await updateCategory.mutateAsync({ id: editingCategory.id, data });
        onToast('Categoría actualizada', 'success');
      } else {
        await createCategory.mutateAsync(data);
        onToast('Categoría creada', 'success');
      }
      setModalType(null);
      setEditingCategory(null);
    } catch {
      onToast('No se pudo guardar la categoría.', 'error');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm('¿Eliminar este producto?')) return;
    try {
      await deleteProduct.mutateAsync(id);
      onToast('Producto eliminado', 'success');
    } catch {
      onToast('No se pudo eliminar.', 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('¿Eliminar esta categoría? Los productos asociados quedarán sin categoría.')) return;
    try {
      await deleteCategory.mutateAsync(id);
      onToast('Categoría eliminada', 'success');
    } catch {
      onToast('No se pudo eliminar. Verifica que no tenga productos.', 'error');
    }
  };

  const productsByCat = (catId: string) =>
    products.filter((p) => p.categoryId === catId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white sticky top-0 z-30 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-4 flex items-center justify-between">
          <h1 className="text-slate-900 text-xl font-semibold">Menú</h1>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingCategory(null); setModalType('category'); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50 active:scale-95 transition-all"
            >
              <Plus size={16} />
              Categoría
            </button>
            <button
              onClick={() => { setEditingProduct(null); setModalType('product'); }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 active:scale-95 transition-all"
            >
              <Plus size={16} />
              Producto
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-3 pb-24">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4 select-none">🍚</span>
            <p className="text-slate-500 text-sm">Aún no hay categorías.</p>
            <p className="text-slate-400 text-xs mt-1">Toca + Categoría para empezar.</p>
          </div>
        ) : (
          categories
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((cat) => {
              const isExpanded = expandedCats.has(cat.id);
              const catProducts = productsByCat(cat.id);
              return (
                <div key={cat.id} className="bg-white rounded-2xl shadow-[0_1px_0_rgba(0,0,0,0.06)] overflow-hidden">
                  <button
                    onClick={() => toggleExpand(cat.id)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                      <span className="font-semibold text-slate-900">{cat.name}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{catProducts.length}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setModalType('category'); }}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      {catProducts.length === 0 ? (
                        <p className="text-sm text-slate-400 py-2">Sin productos en esta categoría.</p>
                      ) : (
                        catProducts.map((product) => (
                          <div
                            key={product.id}
                            className={`flex items-center justify-between p-3 rounded-xl ${product.available ? 'bg-gray-50' : 'bg-red-50/50 opacity-60'}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900 text-sm">{product.name}</span>
                                {!product.available && (
                                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full uppercase tracking-wide">No disp.</span>
                                )}
                              </div>
                              <p className="text-slate-500 text-xs mt-0.5">{formatCOP(product.price)} · {product.preparationMinutes} min</p>
                              {product.description && (
                                <p className="text-slate-400 text-xs mt-0.5 truncate">{product.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              <button
                                onClick={() => { setEditingProduct(product); setModalType('product'); }}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product.id)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {modalType === 'product' && (
        <ProductModal
          categories={categories}
          product={editingProduct}
          onSave={handleSaveProduct}
          onClose={() => { setModalType(null); setEditingProduct(null); }}
        />
      )}

      {modalType === 'category' && (
        <CategoryModal
          category={editingCategory}
          onSave={handleSaveCategory}
          onClose={() => { setModalType(null); setEditingCategory(null); }}
        />
      )}
    </div>
  );
}

function ProductModal({
  categories,
  product,
  onSave,
  onClose,
}: {
  categories: Category[];
  product: Product | null;
  onSave: (data: Omit<Product, 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    id: product?.id ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? (categories[0]?.id ?? ''),
    price: product?.price ?? 0,
    description: product?.description ?? '',
    available: product?.available ?? true,
    preparationMinutes: product?.preparationMinutes ?? 20,
    customizationOptions: product?.customizationOptions?.join(', ') ?? '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: form.id,
      name: form.name,
      categoryId: form.categoryId,
      price: Number(form.price),
      description: form.description || null,
      available: form.available,
      preparationMinutes: Number(form.preparationMinutes),
      customizationOptions: form.customizationOptions.split(',').map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-[480px] sm:rounded-2xl rounded-t-2xl p-4 space-y-4 animate-in slide-in-from-bottom duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{product ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">Cerrar</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!product && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">ID único</label>
              <input required value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="ej: arroz-pollo" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="ej: Arroz Chino de Pollo" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Categoría</label>
            <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Precio ($)</label>
              <input required type="number" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tiempo (min)</label>
              <input required type="number" min={0} value={form.preparationMinutes} onChange={(e) => setForm((f) => ({ ...f, preparationMinutes: Number(e.target.value) }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="opcional" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Personalizaciones (separadas por coma)</label>
            <input value={form.customizationOptions} onChange={(e) => setForm((f) => ({ ...f, customizationOptions: e.target.value }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="ej: sin cebolla, extra pollo" />
          </div>
          <label className="flex items-center gap-2 py-1">
            <input type="checkbox" checked={form.available} onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm text-slate-700">Disponible</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-gray-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-gray-200 active:scale-95 transition-all">Cancelar</button>
            <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 active:scale-95 transition-all">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryModal({
  category,
  onSave,
  onClose,
}: {
  category: Category | null;
  onSave: (data: Omit<Category, 'createdAt'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    id: category?.id ?? '',
    name: category?.name ?? '',
    sortOrder: category?.sortOrder ?? 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: form.id,
      name: form.name,
      sortOrder: Number(form.sortOrder),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-[480px] sm:rounded-2xl rounded-t-2xl p-4 space-y-4 animate-in slide-in-from-bottom duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{category ? 'Editar categoría' : 'Nueva categoría'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">Cerrar</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!category && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">ID único</label>
              <input required value={form.id} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="ej: arroz_chino" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="ej: Arroces Chinos" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Orden</label>
            <input required type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-gray-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-gray-200 active:scale-95 transition-all">Cancelar</button>
            <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 active:scale-95 transition-all">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
