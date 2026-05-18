import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Trash2 } from 'lucide-react';
import * as api from '../../api';
import type { Product } from '../../types';
import Toast from '../ui/Toast';

interface ProductImageSectionProps {
  product: Product;
}

export default function ProductImageSection({ product }: ProductImageSectionProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getProductImage(product.id).then(img => {
      if (!cancelled) { setImageData(img); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [product.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setToast({ msg: t('products.imageTooLarge'), type: 'danger' });
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        await api.saveProductImage(product.id, base64);
        setImageData(dataUrl);
        setToast({ msg: t('products.imageSaved'), type: 'success' });
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setToast({ msg: t('common.error'), type: 'danger' });
      setUploading(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    try {
      await api.deleteProductImage(product.id);
      setImageData(null);
      setToast({ msg: t('products.imageRemoved'), type: 'success' });
    } catch {
      setToast({ msg: t('common.error'), type: 'danger' });
    }
  };

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-ink-main">{t('products.productImage')}</h3>
      {loading ? (
        <div className="h-24 rounded-xl bg-ivory-muted animate-pulse" />
      ) : imageData ? (
        <div className="relative inline-block">
          <img
            src={imageData}
            alt={product.trade_name}
            className="h-32 w-32 rounded-xl object-cover border border-ivory-border shadow-sm"
          />
          <button
            type="button"
            onClick={handleDelete}
            className="absolute -top-2 -start-2 flex h-6 w-6 items-center justify-center rounded-full bg-status-danger text-white shadow"
            title={t('products.removeImage')}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-24 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ivory-border bg-ivory-muted text-ink-muted hover:border-primary-400 hover:text-primary-700 transition-colors disabled:opacity-50"
        >
          <ImagePlus size={20} />
          <span className="text-sm">{uploading ? t('common.loading') : t('products.addImage')}</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
