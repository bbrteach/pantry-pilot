import { useCallback, useEffect, useState } from 'react';
import { Check, Package, Search, X } from 'lucide-react';
import { api } from '../api/client';
import type { GroceryListItem, KrogerProduct } from '../types';

interface ProductPickerModalProps {
  item: GroceryListItem | null;
  onClose: () => void;
  onSelectProduct: (item: GroceryListItem, product: KrogerProduct) => Promise<void>;
}

function stockBadge(stockLevel: string): { label: string; className: string } {
  switch (stockLevel) {
    case 'HIGH':
      return {
        label: 'In Stock',
        className: 'bg-[#EBF4EF] text-[#1B5E42] border-[#C4DDD0]',
      };
    case 'LOW':
      return {
        label: 'Low Stock',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'TEMPORARILY_OUT_OF_STOCK':
      return {
        label: 'Out of Stock',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
    default:
      return {
        label: 'Check Store',
        className: 'bg-[#F5F2EB] text-[#5C6961] border-[#E6E1D6]',
      };
  }
}

export function ProductPickerModal({
  item,
  onClose,
  onSelectProduct,
}: ProductPickerModalProps) {
  const [term, setTerm] = useState('');
  const [products, setProducts] = useState<KrogerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUpc, setSavingUpc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (searchTerm: string) => {
    const clean = searchTerm.trim();
    if (clean.length < 2) {
      setError('Enter at least 2 characters to search Kroger products.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await api.searchKrogerProducts(clean, 6);
      setProducts(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search Kroger products.');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!item) return;
    setTerm(item.name);
    setProducts([]);
    setError(null);
    setSavingUpc(null);
    void runSearch(item.name);
  }, [item, runSearch]);

  if (!item) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(term);
  };

  const handleChoose = async (product: KrogerProduct) => {
    setSavingUpc(product.upc);
    setError(null);
    try {
      await onSelectProduct(item, product);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product mapping.');
    } finally {
      setSavingUpc(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1A241E]/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-picker-title"
    >
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[86vh] rounded-t-3xl sm:rounded-3xl border border-[#E6E1D6] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E6E1D6] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="product-picker-title" className="font-display text-lg sm:text-xl font-bold text-[#1A241E] truncate">
              Match &ldquo;{item.name}&rdquo;
            </h2>
            <p className="text-xs text-[#5C6961]">
              Needed: <strong className="text-[#1A241E]">{item.quantityDisplay}</strong> · Saved permanently for future lists
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product picker"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#5C6961] hover:bg-[#F3EFE6] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="px-5 py-3 border-b border-[#F0ECE3] bg-[#FAF8F4] flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#85918A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="kroger-product-search-input"
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Refine Kroger product search..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#D8D2C5] bg-white text-sm text-[#1A241E] focus:border-[#1B5E42] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-10 px-4 rounded-xl bg-[#1B5E42] text-white text-sm font-semibold hover:bg-[#144A33] disabled:opacity-60 transition-colors cursor-pointer shrink-0"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#5C6961]">
              <div className="w-7 h-7 rounded-full border-3 border-[#C4DDD0] border-t-[#1B5E42] animate-spin" />
              <p className="text-sm font-medium">Searching nearby Kroger catalog...</p>
            </div>
          ) : products.length === 0 && !error ? (
            <div className="py-12 text-center text-[#5C6961]">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-[#1A241E]">No products found</p>
              <p className="text-xs mt-1">Try a broader keyword like brand or item type.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {products.map((product) => {
                const badge = stockBadge(product.stockLevel);
                const isCurrent = item.productMapping?.upc === product.upc;
                const isSaving = savingUpc === product.upc;
                const hasPromo =
                  product.promoPrice !== null &&
                  product.regularPrice !== null &&
                  product.promoPrice < product.regularPrice;

                return (
                  <button
                    key={product.upc}
                    type="button"
                    disabled={savingUpc !== null}
                    onClick={() => void handleChoose(product)}
                    className={`text-left rounded-2xl border-2 p-3.5 flex gap-3 transition-all cursor-pointer ${
                      isCurrent
                        ? 'border-[#1B5E42] bg-[#EBF4EF]'
                        : 'border-[#E6E1D6] bg-white hover:border-[#1B5E42] hover:shadow-sm'
                    }`}
                  >
                    <div className="w-18 h-18 rounded-xl bg-[#FAF8F4] border border-[#ECE7DC] flex items-center justify-center overflow-hidden shrink-0">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.description}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <Package className="w-6 h-6 text-[#85918A]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#1A241E] leading-snug line-clamp-2">
                          {product.description}
                        </p>
                        <p className="text-xs text-[#5C6961] mt-0.5 truncate">
                          {[product.brand, product.size].filter(Boolean).join(' · ') || `UPC ${product.upc}`}
                        </p>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-baseline gap-1.5 tabular-nums">
                          {hasPromo ? (
                            <>
                              <span className="text-sm font-bold text-[#B85D2B]">
                                ${product.promoPrice!.toFixed(2)}
                              </span>
                              <span className="text-xs text-[#85918A] line-through">
                                ${product.regularPrice!.toFixed(2)}
                              </span>
                            </>
                          ) : product.regularPrice !== null ? (
                            <span className="text-sm font-bold text-[#1A241E]">
                              ${product.regularPrice.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-xs text-[#85918A]">Price unavailable</span>
                          )}
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}
                        >
                          {isSaving ? 'Saving...' : isCurrent ? 'Current' : badge.label}
                        </span>
                      </div>
                    </div>

                    {isCurrent && (
                      <span className="w-6 h-6 rounded-full bg-[#1B5E42] text-white flex items-center justify-center shrink-0 self-start">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
