import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Banknote, History, LogOut, RotateCcw, ReceiptText, Keyboard } from 'lucide-react';
import * as api from '../api';
import type { PosSession, PosProduct, CartItem, Sale, PaymentMethodSetting, CustomerRow } from '../types';
import Button from '../components/ui/Button';
import Toast from '../components/ui/Toast';
import { Can } from '../components/Can';

import PrintReceipt from '../components/ui/PrintReceipt';
import { useLicense } from '../hooks/useLicense';
import ReturnModal from './pos/ReturnModal';
import SessionHistoryPanel from './pos/SessionHistoryPanel';
import CloseSessionModal from './pos/CloseSessionModal';
import OpenSessionModal from './pos/OpenSessionModal';
import CartWorkspaceBar from './pos/CartWorkspaceBar';
import SearchResults from './pos/SearchResults';
import CartDisplay from './pos/CartDisplay';
import PaymentPanel from './pos/PaymentPanel';
import ReceiptCustomizerModal from './pos/ReceiptCustomizerModal';
import RxModal from './pos/RxModal';
import { clearWorkspaceState, createWorkspace, loadPosWorkspaceStateAsync, loadReceiptPreferences, loadWorkspaceState, saveReceiptPreferences, saveWorkspaceState, type PosCartWorkspace, type ReceiptPreferences } from './pos/workspaceState';

export default function POS() {
  const { t } = useTranslation();
  const { isBlocked } = useLicense();
  const initialWorkspaceState = useRef(loadWorkspaceState('no-session')).current;
  const initialWorkspace = initialWorkspaceState.active[0] ?? createWorkspace(1);
  const [session, setSession] = useState<PosSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [cart, setCart] = useState<CartItem[]>(initialWorkspace.cart);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PosProduct[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'credit' | 'split'>(initialWorkspace.paymentMethod);
  const [paymentMethodId, setPaymentMethodId] = useState<string>(initialWorkspace.paymentMethodId);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSetting[]>([]);
  const [amountPaid, setAmountPaid] = useState(initialWorkspace.amountPaid);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRole, setHistoryRole] = useState<string | undefined>(undefined);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [editingQtyBatch, setEditingQtyBatch] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialWorkspace.selectedCustomerId);
  const [customerSearch, setCustomerSearch] = useState(initialWorkspace.customerSearch);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [reprintSale, setReprintSale] = useState<Sale | null>(null);
  const [subsFor, setSubsFor] = useState<string | null>(null); // product_id whose substitutes are showing
  const [subsResults, setSubsResults] = useState<PosProduct[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [selectedCartBatch, setSelectedCartBatch] = useState<string | null>(null);
  const [highlightedResultIdx, setHighlightedResultIdx] = useState<number>(-1);
  const [showRxModal, setShowRxModal] = useState(false);
  const [rxPharmacistId, setRxPharmacistId] = useState('');
  const [cartDiscount, setCartDiscount] = useState(initialWorkspace.cartDiscount);          // piasters
  const [discountMode, setDiscountMode] = useState<'flat' | 'pct'>(initialWorkspace.discountMode); // toggle
  const [discountInput, setDiscountInput] = useState(initialWorkspace.discountInput);       // raw string while typing
  const [saleNote, setSaleNote] = useState(initialWorkspace.saleNote);
  const [splitCashAmount, setSplitCashAmount] = useState(initialWorkspace.splitCashAmount);
  const [splitBankAmount, setSplitBankAmount] = useState(initialWorkspace.splitBankAmount);
  const [splitBankMethodId, setSplitBankMethodId] = useState(initialWorkspace.splitBankMethodId);
  const [workspaces, setWorkspaces] = useState<PosCartWorkspace[]>(initialWorkspaceState.active);
  const [parkedWorkspaces, setParkedWorkspaces] = useState<PosCartWorkspace[]>(initialWorkspaceState.parked);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspace.id);
  const [receiptPreferences, setReceiptPreferences] = useState<ReceiptPreferences>(loadReceiptPreferences());
  const [showReceiptCustomizer, setShowReceiptCustomizer] = useState(false);
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [receiptPrintLogo, setReceiptPrintLogo] = useState(true);
  const [receiptLogoPosition, setReceiptLogoPosition] = useState<'center' | 'right' | 'left'>('center');
  const [receiptLogoSize, setReceiptLogoSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [savingReceiptCustomizer, setSavingReceiptCustomizer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const branchId = api.getBranchId();
  const workspaceSessionKey = session?.id || 'no-session';

  const loadSession = useCallback(async (surfaceErrors = false) => {
    setLoadingSession(true);
    try {
      const auth = api.getAuthState();
      const [s, custs, pms, tenant] = await Promise.all([
        api.getActiveSession(branchId, auth.user!.id),
        api.getCustomers(undefined, true),
        api.getPaymentMethods(true),
        api.getTenantSettings(),
      ]);
      setSession(s);
      setCustomers(custs);
      setPaymentMethods(pms);
      setReceiptHeader(tenant.receipt_header || '');
      setReceiptFooter(tenant.receipt_footer || '');
      setReceiptPrintLogo(tenant.print_logo !== false);
      setReceiptLogoPosition(tenant.logo_position || 'center');
      setReceiptLogoSize(tenant.logo_size || 'medium');
    } catch (e: unknown) {
      setSession(null);
      if (surfaceErrors) {
        const msg = e instanceof Error ? e.message : t('common.error');
        setToast({ msg, type: 'danger' });
        throw e;
      }
    } finally {
      setLoadingSession(false);
    }
  }, [branchId, t]);

  useEffect(() => { loadSession(); }, [loadSession]);

  const buildWorkspaceSnapshot = useCallback((workspaceId = activeWorkspaceId, currentWorkspace?: PosCartWorkspace): PosCartWorkspace => {
    return {
      ...(currentWorkspace ?? createWorkspace(workspaces.length + parkedWorkspaces.length + 1)),
      id: workspaceId,
      cart,
      paymentMethod,
      paymentMethodId,
      amountPaid,
      selectedCustomerId,
      customerSearch,
      cartDiscount,
      discountMode,
      discountInput,
      saleNote,
      splitCashAmount,
      splitBankAmount,
      splitBankMethodId,
    };
  }, [activeWorkspaceId, amountPaid, cart, cartDiscount, customerSearch, discountInput, discountMode, parkedWorkspaces.length, paymentMethod, paymentMethodId, saleNote, selectedCustomerId, splitBankAmount, splitBankMethodId, splitCashAmount, workspaces.length]);

  const hydrateWorkspace = useCallback((workspace: PosCartWorkspace) => {
    setCart(workspace.cart);
    setPaymentMethod(workspace.paymentMethod);
    setPaymentMethodId(workspace.paymentMethodId);
    setAmountPaid(workspace.amountPaid);
    setSelectedCustomerId(workspace.selectedCustomerId);
    setCustomerSearch(workspace.customerSearch);
    setCartDiscount(workspace.cartDiscount);
    setDiscountMode(workspace.discountMode);
    setDiscountInput(workspace.discountInput);
    setSaleNote(workspace.saleNote);
    setSplitCashAmount(workspace.splitCashAmount);
    setSplitBankAmount(workspace.splitBankAmount);
    setSplitBankMethodId(workspace.splitBankMethodId);
    setSelectedCartBatch(null);
  }, []);

  useEffect(() => {
    setWorkspaces((current) => current.map((workspace) => (
      workspace.id === activeWorkspaceId ? buildWorkspaceSnapshot(workspace.id, workspace) : workspace
    )));
  }, [activeWorkspaceId, buildWorkspaceSnapshot]);

  useEffect(() => {
    saveWorkspaceState(workspaceSessionKey, workspaces, parkedWorkspaces);
  }, [parkedWorkspaces, workspaceSessionKey, workspaces]);

  useEffect(() => {
    saveReceiptPreferences(receiptPreferences);
  }, [receiptPreferences]);

  useEffect(() => {
    if (workspaceSessionKey === 'no-session') {
      const fresh = createWorkspace(1);
      setWorkspaces([fresh]);
      setParkedWorkspaces([]);
      setActiveWorkspaceId(fresh.id);
      hydrateWorkspace(fresh);
      return;
    }
    loadPosWorkspaceStateAsync(workspaceSessionKey).then(scopedState => {
      const nextWorkspace = scopedState.active[0] ?? createWorkspace(1);
      setWorkspaces(scopedState.active.length > 0 ? scopedState.active : [nextWorkspace]);
      setParkedWorkspaces(scopedState.parked);
      setActiveWorkspaceId(nextWorkspace.id);
      hydrateWorkspace(nextWorkspace);
    });
  }, [hydrateWorkspace, workspaceSessionKey]);

  const resetActiveSaleState = useCallback(() => {
    setCart([]);
    setAmountPaid(0);
    setPaymentMethod('cash');
    setPaymentMethodId('');
    setSelectedCustomerId('');
    setCustomerSearch('');
    setSelectedCartBatch(null);
    setHighlightedResultIdx(-1);
    setShowRxModal(false);
    setRxPharmacistId('');
    setCartDiscount(0);
    setDiscountInput('');
    setDiscountMode('flat');
    setSaleNote('');
    setSplitCashAmount(0);
    setSplitBankAmount(0);
    setSplitBankMethodId('');
  }, []);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setWorkspaces((current) => {
      const snapshot = buildWorkspaceSnapshot(activeWorkspaceId, current.find((workspace) => workspace.id === activeWorkspaceId));
      const nextState = current.map((workspace) => (
        workspace.id === activeWorkspaceId ? snapshot : workspace
      ));
      const nextWorkspace = nextState.find((workspace) => workspace.id === workspaceId);
      if (nextWorkspace) {
        setActiveWorkspaceId(workspaceId);
        hydrateWorkspace(nextWorkspace);
      }
      return nextState;
    });
  }, [activeWorkspaceId, buildWorkspaceSnapshot, hydrateWorkspace]);

  const addWorkspace = useCallback(() => {
    const nextWorkspace = {
      ...createWorkspace(workspaces.length + parkedWorkspaces.length + 1),
      name: `${t('pos.cartLabel')} ${workspaces.length + parkedWorkspaces.length + 1}`,
    };
    setWorkspaces((current) => {
      const snapshot = buildWorkspaceSnapshot(activeWorkspaceId, current.find((workspace) => workspace.id === activeWorkspaceId));
      return current.map((workspace) => workspace.id === activeWorkspaceId ? snapshot : workspace).concat(nextWorkspace);
    });
    setActiveWorkspaceId(nextWorkspace.id);
    hydrateWorkspace(nextWorkspace);
  }, [activeWorkspaceId, buildWorkspaceSnapshot, hydrateWorkspace, parkedWorkspaces.length, t, workspaces.length]);

  const parkActiveWorkspace = useCallback(() => {
    const snapshot = buildWorkspaceSnapshot();
    if (snapshot.cart.length === 0) {
      setToast({ msg: t('pos.parkRequiresItems'), type: 'danger' });
      return false;
    }

    const parkedWorkspace = { ...snapshot, parkedAt: new Date().toISOString() };
    const remaining = workspaces.filter((workspace) => workspace.id !== snapshot.id);
    const nextActive = remaining[0] ?? {
      ...createWorkspace(workspaces.length + parkedWorkspaces.length + 1),
      name: `${t('pos.cartLabel')} ${workspaces.length + parkedWorkspaces.length + 1}`,
    };

    setParkedWorkspaces((current) => [parkedWorkspace, ...current]);
    setWorkspaces(remaining.length > 0 ? remaining : [nextActive]);
    setActiveWorkspaceId(nextActive.id);
    hydrateWorkspace(nextActive);
    return true;
  }, [buildWorkspaceSnapshot, hydrateWorkspace, parkedWorkspaces.length, t, workspaces]);

  const restoreParkedWorkspace = useCallback((workspaceId: string) => {
    const parkedWorkspace = parkedWorkspaces.find((workspace) => workspace.id === workspaceId);
    if (!parkedWorkspace) return;

    const snapshot = buildWorkspaceSnapshot();
    const restoredWorkspace = { ...parkedWorkspace, parkedAt: undefined };
    setParkedWorkspaces((current) => current.filter((workspace) => workspace.id !== workspaceId));
    setWorkspaces((current) => current.map((workspace) => (
      workspace.id === activeWorkspaceId ? snapshot : workspace
    )).concat(restoredWorkspace));
    setActiveWorkspaceId(restoredWorkspace.id);
    hydrateWorkspace(restoredWorkspace);
  }, [activeWorkspaceId, buildWorkspaceSnapshot, hydrateWorkspace, parkedWorkspaces]);

  const deleteParkedWorkspace = useCallback((workspaceId: string) => {
    setParkedWorkspaces((current) => current.filter((workspace) => workspace.id !== workspaceId));
  }, []);

  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const handler = (e: KeyboardEvent) => {
      if (showReturnModal || showCloseModal || showOpenModal || editingQtyBatch !== null) return;

      if (e.key === 'F12') { e.preventDefault(); handleSale(); return; }
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'F6') { e.preventDefault(); setPaymentMethod('cash'); setPaymentMethodId(''); return; }
      if (e.key === 'F7') {
        e.preventDefault();
        const firstBank = paymentMethods.find(pm => pm.method_type === 'bank_transfer' && pm.is_active);
        setPaymentMethod('bank_transfer');
        setPaymentMethodId(firstBank?.id || '');
        return;
      }
      if (e.key === 'F8') { e.preventDefault(); setPaymentMethod('credit'); setPaymentMethodId(''); return; }

      // Search-specific shortcuts (only when search input is focused)
      if (document.activeElement === searchRef.current) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedResultIdx(i => Math.min(i + 1, searchResults.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedResultIdx(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' && searchResults.length > 0) {
          e.preventDefault();
          const idx = highlightedResultIdx >= 0 ? highlightedResultIdx : 0;
          const p = searchResults[idx];
          if (p) addToCart(p, 0);
          return;
        }
        if (e.key === 'Escape') {
          setSearchQuery('');
          setSearchResults([]);
          setHighlightedResultIdx(-1);
          searchRef.current?.blur();
          return;
        }
        // Let normal typing work in search input
        return;
      }

      // Cart shortcuts — only when not typing in an input
      if (isInputFocused()) return;

      if (e.key === 'Escape') {
        if (searchResults.length > 0) {
          setSearchQuery('');
          setSearchResults([]);
          setHighlightedResultIdx(-1);
        } else {
          setSelectedCartBatch(null);
        }
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey) {
        if (selectedCartBatch) {
          e.preventDefault();
          removeFromCart(selectedCartBatch);
          setSelectedCartBatch(null);
        }
        return;
      }

      if (e.key === 'Delete' && e.ctrlKey) {
        e.preventDefault();
        resetActiveSaleState();
        return;
      }

      if (e.key === '+' || e.key === 'Add') {
        if (selectedCartBatch) { e.preventDefault(); updateQty(selectedCartBatch, 1); }
        return;
      }

      if (e.key === '-' || e.key === 'Subtract') {
        if (selectedCartBatch) {
          e.preventDefault();
          const batchId = selectedCartBatch;
          setCart(prev => {
            const item = prev.find(c => c.batch_id === batchId);
            if (!item) return prev;
            if (item.quantity <= 1) return prev; // removeFromCart handles removal
            return prev.map(c => c.batch_id === batchId
              ? { ...c, quantity: c.quantity - 1 }
              : c);
          });
          // Use removeFromCart (clears selectedCartBatch too) when qty is 1
          const item = cart.find(c => c.batch_id === batchId);
          if (item && item.quantity <= 1) removeFromCart(batchId);
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReturnModal, showCloseModal, showOpenModal, editingQtyBatch, paymentMethods, selectedCartBatch, searchResults, highlightedResultIdx, resetActiveSaleState]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setSearchResults([]); return; }
    try {
      const results = await api.searchProductsPos(branchId, q);
      setSearchResults(results);
      // Barcode auto-add: if query looks like a barcode (digits only) and exactly 1 result matched by exact barcode
      if (/^\d{6,}$/.test(q) && results.length === 1 && results[0].barcode === q) {
        const p = results[0];
        if (p.batches.length > 0 && p.batches[0].quantity_current > 0) {
          addToCart(p, 0);
        }
      }
    } catch {
      setSearchResults([]);
    }
  }, [branchId]); // addToCart intentionally omitted — stable reference not needed for barcode trigger

  useEffect(() => {
    const timer = setTimeout(() => doSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, doSearch]);

  const addToCart = (product: PosProduct, batchIdx: number) => {
    const batch = product.batches[batchIdx];
    if (!batch) return;
    setCart(prev => {
      const exists = prev.find(c => c.batch_id === batch.batch_id);
      if (exists) {
        // Effective available = backend stock - already in cart
        const effectiveMax = batch.quantity_current;
        if (exists.quantity >= effectiveMax) return prev;
        return prev.map(c => c.batch_id === batch.batch_id
          ? { ...c, quantity: c.quantity + 1 }
          : c);
      }
      if (batch.quantity_current < 1) return prev;
      return [...prev, {
        product_id: product.product_id,
        product_name: product.product_name,
        is_prescription: product.is_prescription,
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date,
        quantity: 1,
        max_quantity: batch.quantity_current,
        unit_price: product.sale_price,
        unit_cost: batch.unit_cost,
        subtotal: product.sale_price,
      }];
    });
    setSearchQuery('');
    setSearchResults([]);
    setHighlightedResultIdx(-1);
    setSubsFor(null);
    setSubsResults([]);
    searchRef.current?.focus();
  };

  const updateQty = (batchId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.batch_id !== batchId) return c;
      const newQty = c.quantity + delta;
      if (newQty <= 0 || newQty > c.max_quantity) return c;
      return { ...c, quantity: newQty };
    }));
  };

  const removeFromCart = (batchId: string) => {
    setCart(prev => prev.filter(c => c.batch_id !== batchId));
    setSelectedCartBatch(prev => prev === batchId ? null : prev);
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);
  const finalTotal = Math.max(0, cartTotal - cartDiscount);
  const normalizedSplitCashAmount = Math.max(0, Math.round(splitCashAmount));
  const normalizedSplitBankAmount = Math.max(0, Math.round(splitBankAmount));
  const splitPaidTotal = normalizedSplitCashAmount + normalizedSplitBankAmount;
  const splitRemaining = Math.max(0, finalTotal - splitPaidTotal);
  // Cash change in split: how much cash the cashier gives back (bank amount is always exact)
  const splitCashChange = Math.max(0, normalizedSplitCashAmount - Math.max(0, finalTotal - normalizedSplitBankAmount));

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => {
      const name = (c.name_ar || c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [customers, customerSearch]);

  const bankMethods = useMemo(
    () => paymentMethods.filter(pm => pm.method_type === 'bank_transfer' && pm.is_active),
    [paymentMethods],
  );

  const handleOpenSession = async (openingCash: number) => {
    const auth = api.getAuthState();
    const accounts = await api.getAccounts(branchId);
    const defaultAccount = accounts.find(a => a.is_default) || accounts[0];
    if (!defaultAccount) { setToast({ msg: t('common.error'), type: 'danger' }); return; }
    const s = await api.openSession(branchId, auth.user!.id, defaultAccount.id, openingCash);
    setSession(s);
    setShowOpenModal(false);
  };

  const handleSaveReceiptCustomizer = async (next: {
    header: string;
    footer: string;
    printLogo: boolean;
    logoPosition: 'center' | 'right' | 'left';
    logoSize: 'small' | 'medium' | 'large';
    preferences: ReceiptPreferences;
  }) => {
    setSavingReceiptCustomizer(true);
    try {
      const tenant = await api.getTenantSettings();
      await api.updateTenantSettings({
        name: tenant.name,
        name_ar: tenant.name_ar,
        license_number: tenant.license_number,
        phone: tenant.phone,
        address: tenant.address,
        currency_code: tenant.currency_code,
        timezone: tenant.timezone,
        receipt_header: next.header,
        receipt_footer: next.footer,
        print_logo: next.printLogo,
        logo_position: next.logoPosition,
        logo_size: next.logoSize,
      });
      setReceiptHeader(next.header);
      setReceiptFooter(next.footer);
      setReceiptPrintLogo(next.printLogo);
      setReceiptLogoPosition(next.logoPosition);
      setReceiptLogoSize(next.logoSize);
      setReceiptPreferences(next.preferences);
      setShowReceiptCustomizer(false);
      setToast({ msg: t('pos.receiptCustomizerSaved'), type: 'success' });
    } catch (error: unknown) {
      setToast({ msg: error instanceof Error ? error.message : t('common.error'), type: 'danger' });
    } finally {
      setSavingReceiptCustomizer(false);
    }
  };

  const handleShowSubs = async (productId: string) => {
    if (subsFor === productId) { setSubsFor(null); setSubsResults([]); return; }
    setSubsFor(productId);
    setSubsLoading(true);
    try {
      setSubsResults(await api.getPosSubstitutes(branchId, productId));
    } catch { setSubsResults([]); }
    finally { setSubsLoading(false); }
  };

  const hasRxItems = cart.some(c => c.is_prescription);

  const doCompleteSale = async (pharmacistOverrideBy?: string) => {
    if (!session) return;
    setSaving(true);
    try {
      const auth = api.getAuthState();
      const splitPayments = paymentMethod === 'split'
        ? [
            normalizedSplitCashAmount > 0 ? { payment_method: 'cash' as const, amount: normalizedSplitCashAmount } : null,
            normalizedSplitBankAmount > 0 ? { payment_method: 'bank_transfer' as const, payment_method_id: splitBankMethodId, amount: normalizedSplitBankAmount } : null,
          ].filter((p): p is NonNullable<typeof p> => p !== null)
        : undefined;
      const sale = await api.createSale({
        sessionId: session.id,
        branchId,
        cashierId: auth.user!.id,
        paymentMethod: paymentMethod === 'split' ? 'partial' : paymentMethod,
        paymentMethodId: paymentMethod === 'bank_transfer' ? paymentMethodId : undefined,
        amountPaid: paymentMethod === 'cash' ? amountPaid : paymentMethod === 'split' ? splitPaidTotal : finalTotal,
        customerId: selectedCustomerId || undefined,
        discount: cartDiscount > 0 ? cartDiscount : undefined,
        pharmacistOverrideBy: pharmacistOverrideBy || undefined,
        notes: saleNote.trim() || undefined,
        splitPayments,
        items: cart.map(c => ({ product_id: c.product_id, batch_id: c.batch_id, quantity: c.quantity, unit_price: c.unit_price, unit_cost: c.unit_cost })),
      });
      setReprintSale(sale);
      setTimeout(() => { api.printThermal(); setReprintSale(null); }, 200);
      resetActiveSaleState();
      setToast({ msg: t('pos.saleSuccess'), type: 'success' });
      loadSession();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : t('common.error'), type: 'danger' });
    } finally { setSaving(false); }
  };

  const handleSale = async () => {
    if (!session || cart.length === 0) return;
    if (paymentMethod === 'cash' && amountPaid < finalTotal) { setToast({ msg: t('pos.insufficientPayment'), type: 'danger' }); return; }
    if (paymentMethod === 'credit' && !selectedCustomerId) { setToast({ msg: t('pos.creditRequiresCustomer'), type: 'danger' }); return; }
    if (paymentMethod === 'bank_transfer' && !paymentMethodId) { setToast({ msg: t('common.required'), type: 'danger' }); return; }
    if (paymentMethod === 'split') {
      if (finalTotal > 0 && splitPaidTotal <= 0) { setToast({ msg: t('pos.splitPaymentRequired'), type: 'danger' }); return; }
      if (normalizedSplitBankAmount > 0 && !splitBankMethodId) { setToast({ msg: t('pos.splitBankAccountRequired'), type: 'danger' }); return; }
      if (normalizedSplitBankAmount > finalTotal) { setToast({ msg: t('pos.splitPaymentTooHigh'), type: 'danger' }); return; }
      if (splitRemaining > 0 && !selectedCustomerId) { setToast({ msg: t('pos.creditRequiresCustomer'), type: 'danger' }); return; }
    }
    if (hasRxItems) { setShowRxModal(true); return; }
    await doCompleteSale();
  };

  const handleDiscountModeToggle = useCallback((mode: 'flat' | 'pct') => {
    setDiscountMode(mode);
    setDiscountInput('');
    setCartDiscount(0);
  }, []);

  const handleDiscountInputChange = useCallback((value: string) => {
    setDiscountInput(value);
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) { setCartDiscount(0); return; }
    if (discountMode === 'flat') {
      setCartDiscount(Math.round(num * 100));
    } else {
      const pct = Math.min(100, num);
      setCartDiscount(Math.round(cartTotal * pct / 100));
    }
  }, [cartTotal, discountMode]);

  const handleCloseSession = async (actualCash: number) => {
    if (!session) return;
    try {
      const closingSessionId = session.id;
      await api.closeSession(session.id, actualCash);
      clearWorkspaceState(closingSessionId);
      setShowCloseModal(false);
      setSession(null);
      setWorkspaces([createWorkspace(1)]);
      setParkedWorkspaces([]);
      setActiveWorkspaceId(initialWorkspace.id);
      resetActiveSaleState();
      loadSession();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : t('common.error'), type: 'danger' });
    }
  };

  const loadHistory = () => {
    const auth = api.getAuthState();
    const role = auth.role?.name;
    setHistoryRole(role === 'owner' || role === 'manager' ? undefined : auth.user?.id);
    setShowHistory(true);
  };

  const handleReprint = async (saleId: string) => {
    try {
      const sale = await api.getSaleDetail(saleId);
      setReprintSale(sale);
      setTimeout(() => { api.printThermal(); setReprintSale(null); }, 200);
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : t('common.error'), type: 'danger' });
    }
  };

  if (loadingSession) return <div className="app-card py-12 text-center text-sm text-ink-muted">{t('common.loading')}</div>;

  return (
    <>
    {!session ? (
      <div className="app-card mx-auto flex max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
          <Banknote size={30} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-ink-main mb-2">{t('pos.noActiveSession')}</h2>
          <p className="text-ink-muted text-sm">{t('pos.openSessionHint')}</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowOpenModal(true)}>{t('pos.openSession')}</Button>
          <Button variant="ghost" onClick={loadHistory}>
            <History size={16} className="inline ms-1" />{t('pos.history')}
          </Button>
        </div>
      </div>
    ) : (
      <div className="grid h-[calc(100vh-140px)] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_360px] overflow-hidden">
      {/* Left: Cart area */}
      <div className="min-w-0 flex flex-col gap-4 h-full overflow-hidden">
        <CartWorkspaceBar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          parkedWorkspaces={parkedWorkspaces}
          onSwitch={switchWorkspace}
          onAdd={addWorkspace}
          onPark={parkActiveWorkspace}
          onRestore={restoreParkedWorkspace}
          onDelete={deleteParkedWorkspace}
        />

        {/* Search */}
        <div className="app-panel relative p-4">
          <Search size={16} className="absolute end-7 top-[34px] -translate-y-1/2 text-ink-muted" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setHighlightedResultIdx(-1); }}
            placeholder={`${t('pos.searchProduct')} — F3`}
            className="app-input w-full ps-10 pe-3 py-3 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          {searchResults.length > 0 ? (
            <SearchResults
              results={searchResults}
              cart={cart}
              subsFor={subsFor}
              subsResults={subsResults}
              subsLoading={subsLoading}
              highlightedResultIdx={highlightedResultIdx}
              onAddToCart={(item) => addToCart(item, 0)}
              onShowSubs={handleShowSubs}
              t={t}
              formatMoney={api.formatMoney}
            />
          ) : searchQuery.trim() ? (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-ivory-border bg-white shadow-[var(--shadow-float)] px-4 py-3 text-center text-sm text-ink-muted">
              لا توجد منتجات مطابقة لـ "{searchQuery}"
            </div>
          ) : null}
        </div>

        {/* Cart bar */}
        <div className="app-panel flex items-center justify-between px-4 py-3 text-sm">
          <div className="text-ink-muted"><span className="font-medium text-ink-main">{cart.length}</span> {t('pos.items')}</div>
          <button
            onClick={resetActiveSaleState}
            disabled={cart.length === 0}
            className="rounded-xl border border-ivory-border bg-white px-3 py-1.5 text-xs text-ink-muted hover:bg-ivory-muted disabled:opacity-40"
          >{t('pos.clear')}</button>
        </div>

        <CartDisplay
          cart={cart}
          onIncrement={(idx) => {
            const item = cart[idx];
            if (item) updateQty(item.batch_id, 1);
          }}
          onDecrement={(idx) => {
            const item = cart[idx];
            if (item) updateQty(item.batch_id, -1);
          }}
          onRemove={(idx) => {
            const item = cart[idx];
            if (item) removeFromCart(item.batch_id);
          }}
          selectedBatch={selectedCartBatch}
          onSelectBatch={setSelectedCartBatch}
          editingQtyBatch={editingQtyBatch}
          onEditQty={(batchId) => setEditingQtyBatch(prev => prev === batchId ? null : batchId)}
          onSetQuantity={(batchId, rawV) => {
            const item = cart.find(c => c.batch_id === batchId);
            if (!item) return;
            const qty = Math.max(1, Math.min(item.max_quantity, Math.round(rawV)));
            setCart(prev => prev.map(c => c.batch_id === batchId ? { ...c, quantity: qty } : c));
            setEditingQtyBatch(null);
          }}
          t={t}
          formatMoney={api.formatMoney}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-ink-muted">
          <Keyboard size={11} className="text-ink-muted" />
          <span>F12: {t('pos.save')}</span>
          <span>F3: {t('pos.focusSearch')}</span>
          <span>F6/F7/F8: {t('pos.paymentMethod')}</span>
          <span>{t('pos.kbSelect')}: {t('pos.kbDelete')}</span>
          <span>+/-: {t('pos.kbQty')}</span>
          <span>Ctrl+Del: {t('pos.clear')}</span>
        </div>
      </div>

      {/* Right: Payment area */}
      <div className="min-w-0 xl:min-w-[320px] flex flex-col gap-4 h-full overflow-hidden">
        {/* Session info */}
        <div className="app-panel p-4 flex justify-between items-center">
          <div>
            <div className="text-xs text-ink-muted">{t('pos.session')}</div>
            <div className="text-sm font-medium text-ink-main">
              <span>{t('pos.salesCount')}: </span>
              <span className="text-primary-600 font-bold">{session.sales_count}</span>
              <span className="mx-2 text-ink-placeholder">|</span>
              <span className="font-bold tabular-nums">{api.formatMoney(session.total_sales)}</span>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowReceiptCustomizer(true)} className="p-1.5 text-ink-muted hover:text-primary-600" title={t('pos.receiptCustomizerTitle')}><ReceiptText size={16} /></button>
            <Can resource="pos.returns"><button onClick={() => setShowReturnModal(true)} className="p-1.5 text-ink-muted hover:text-status-warning" title={t('pos.returns')}><RotateCcw size={16} /></button></Can>
            <Can resource="pos.history"><button onClick={loadHistory} className="p-1.5 text-ink-muted hover:text-primary-600" title={t('pos.history')}><History size={16} /></button></Can>
            <button onClick={() => setShowCloseModal(true)} className="p-1.5 text-ink-muted hover:text-status-danger" title={t('pos.closeSession')}><LogOut size={16} /></button>
          </div>
        </div>

          <PaymentPanel
            cart={cart}
            cartTotal={cartTotal}
            cartDiscount={cartDiscount}
            finalTotal={finalTotal}
            paymentMethod={paymentMethod}
            paymentMethodId={paymentMethodId || null}
            amountPaid={amountPaid}
            paymentMethods={paymentMethods}
            bankMethods={bankMethods}
            splitCashAmount={splitCashAmount}
            splitBankAmount={splitBankAmount}
            splitBankMethodId={splitBankMethodId || null}
            splitCashChange={splitCashChange}
            splitRemaining={splitRemaining}
            saleNote={saleNote}
            discountMode={discountMode}
            discountInput={discountInput}
            selectedCustomerId={selectedCustomerId || null}
            customerSearch={customerSearch}
            filteredCustomers={filteredCustomers}
            customers={customers}
            saving={saving}
            isBlocked={isBlocked}
            normalizedSplitCashAmount={normalizedSplitCashAmount}
            normalizedSplitBankAmount={normalizedSplitBankAmount}
            loading={false}
            editingQtyBatch={editingQtyBatch}
            onPaymentMethodChange={(method) => setPaymentMethod(method as 'cash' | 'bank_transfer' | 'credit' | 'split')}
            onPaymentMethodIdChange={(id) => setPaymentMethodId(id || '')}
            onAmountPaidChange={setAmountPaid}
            onSplitCashAmountChange={setSplitCashAmount}
            onSplitBankAmountChange={setSplitBankAmount}
            onSplitBankMethodIdChange={(id) => setSplitBankMethodId(id || '')}
            onCustomerSearchChange={setCustomerSearch}
            onCustomerSelect={(id) => setSelectedCustomerId(id || '')}
            onDiscountModeToggle={handleDiscountModeToggle}
            onDiscountInputChange={handleDiscountInputChange}
            onSaleNoteChange={setSaleNote}
            onCompleteSale={handleSale}
            onCustomerCreated={() => { api.getCustomers(undefined, true).then(setCustomers).catch((e: unknown) => { console.error('[POS] getCustomers failed:', e); }); }}
            t={t}
            formatMoney={api.formatMoney}
          />
      </div>
      </div>
    )}

    {showCloseModal && session && (
      <CloseSessionModal onConfirm={handleCloseSession} onClose={() => setShowCloseModal(false)} parkedCount={parkedWorkspaces.length} />
    )}

    {showHistory && (
      <SessionHistoryPanel branchId={branchId} cashierId={historyRole ?? ''} onClose={() => setShowHistory(false)} onReprint={handleReprint} />
    )}

    {showOpenModal && (
      <OpenSessionModal onConfirm={handleOpenSession} onClose={() => setShowOpenModal(false)} />
    )}

    {showReturnModal && (
      <ReturnModal session={session} onClose={() => setShowReturnModal(false)} onSuccess={() => loadSession(true)} />
    )}

    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <RxModal
      open={showRxModal}
      pharmacistId={rxPharmacistId}
      saving={saving}
      onClose={() => { setShowRxModal(false); setRxPharmacistId(''); }}
      onChange={setRxPharmacistId}
      onConfirm={() => doCompleteSale(rxPharmacistId.trim())}
    />

    {showReceiptCustomizer && (
      <ReceiptCustomizerModal
        header={receiptHeader}
        footer={receiptFooter}
        printLogo={receiptPrintLogo}
        logoPosition={receiptLogoPosition}
        logoSize={receiptLogoSize}
        preferences={receiptPreferences}
        saving={savingReceiptCustomizer}
        onClose={() => setShowReceiptCustomizer(false)}
        onSave={handleSaveReceiptCustomizer}
      />
    )}

    {reprintSale && (
      <PrintReceipt
        saleNumber={reprintSale.sale_number}
        date={reprintSale.created_at}
        items={reprintSale.items}
        subtotal={reprintSale.subtotal}
        total={reprintSale.total}
        discount={reprintSale.discount}
        taxAmount={reprintSale.tax_amount}
        paymentMethod={reprintSale.payment_method}
        paymentMethodName={reprintSale.payment_method_name}
        amountPaid={reprintSale.amount_paid}
        changeAmount={reprintSale.change_amount}
        customerName={reprintSale.customer_name}
        notes={reprintSale.notes}
        splitPayments={reprintSale.split_payments}
        preferences={receiptPreferences}
        cashierName={api.getAuthState().user?.full_name}
      />
    )}
    </>
  );
}
