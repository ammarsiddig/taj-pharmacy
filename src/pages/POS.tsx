import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, Plus, Minus, Banknote, Smartphone, History, LogOut, RotateCcw, FileText, Tag, Percent, AlertTriangle, ReceiptText, Wallet } from 'lucide-react';
import * as api from '../api';
import type { PosSession, PosProduct, CartItem, Sale, PaymentMethodSetting, CustomerRow } from '../types';
import Button from '../components/ui/Button';
import Toast from '../components/ui/Toast';
import NumericInput from '../components/ui/NumericInput';
import Numpad from '../components/ui/Numpad';
import PrintReceipt from '../components/ui/PrintReceipt';
import { useLicense } from '../hooks/useLicense';
import ReturnModal from './pos/ReturnModal';
import SessionHistoryPanel from './pos/SessionHistoryPanel';
import CloseSessionModal from './pos/CloseSessionModal';
import OpenSessionModal from './pos/OpenSessionModal';
import CartWorkspaceBar from './pos/CartWorkspaceBar';
import ReceiptCustomizerModal from './pos/ReceiptCustomizerModal';
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
  const [showParkedSales, setShowParkedSales] = useState(false);
  const [receiptPreferences, setReceiptPreferences] = useState<ReceiptPreferences>(loadReceiptPreferences());
  const [showReceiptCustomizer, setShowReceiptCustomizer] = useState(false);
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [receiptPrintLogo, setReceiptPrintLogo] = useState(true);
  const [savingReceiptCustomizer, setSavingReceiptCustomizer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const branchId = api.getBranchId();
  const workspaceSessionKey = session?.id || 'no-session';

  const loadSession = useCallback(async () => {
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
    } catch {
      setSession(null);
    } finally {
      setLoadingSession(false);
    }
  }, [branchId]);

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
      return;
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
    setShowParkedSales(true);
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
  const change = paymentMethod === 'cash' ? amountPaid - finalTotal : 0;
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

  const quickCashAmounts = useMemo(() => {
    if (finalTotal <= 0) return [0];
    const rounded10k = Math.ceil(finalTotal / 10000) * 10000;
    const rounded50k = Math.ceil(finalTotal / 50000) * 50000;
    return Array.from(new Set([finalTotal, rounded10k, rounded50k])).slice(0, 3);
  }, [finalTotal]);

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
      });
      setReceiptHeader(next.header);
      setReceiptFooter(next.footer);
      setReceiptPrintLogo(next.printLogo);
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
          parkedCount={parkedWorkspaces.length}
          onSwitch={switchWorkspace}
          onAdd={addWorkspace}
          onPark={parkActiveWorkspace}
          onToggleParked={() => setShowParkedSales(prev => !prev)}
        />

        {showParkedSales && (
          <div className="app-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink-main">{t('pos.parkedSales')}</h3>
                <p className="text-xs text-ink-muted">{t('pos.parkedSalesHint')}</p>
              </div>
              <button type="button" onClick={() => setShowParkedSales(false)} className="text-xs text-ink-muted hover:text-ink-main">
                {t('common.close')}
              </button>
            </div>
            {parkedWorkspaces.length === 0 ? (
              <div className="rounded-2xl bg-ivory-muted px-4 py-6 text-center text-sm text-ink-muted">{t('pos.noParkedSales')}</div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {parkedWorkspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => restoreParkedWorkspace(workspace.id)}
                    className="rounded-2xl border border-ivory-border bg-white px-4 py-3 text-right hover:border-primary-300 hover:bg-primary-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink-main">{workspace.name}</span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{t('pos.restoreSale')}</span>
                    </div>
                    <div className="mt-2 text-xs text-ink-muted">{workspace.cart.length} {t('pos.items')}</div>
                    <div className="mt-1 text-xs text-ink-muted">{workspace.parkedAt ? new Date(workspace.parkedAt).toLocaleTimeString() : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="app-panel relative p-4">
          <Search size={16} className="absolute right-7 top-[34px] -translate-y-1/2 text-ink-muted" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setHighlightedResultIdx(-1); }}
            placeholder={t('pos.searchProduct')}
            className="app-input w-full ps-10 pe-3 py-3 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          {searchResults.length > 0 && (
            <div className="absolute inset-x-4 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
              {searchResults.map((p, resultIdx) => {
                const backendStock = p.batches.reduce((s, b) => s + b.quantity_current, 0);
                const cartQty = cart.find(c => c.product_id === p.product_id)?.quantity ?? 0;
                const effectiveStock = Math.max(0, backendStock - cartQty);
                const outOfStock = effectiveStock === 0;
                const lowStock = !outOfStock && effectiveStock <= 5;
                return (
                  <div key={p.product_id} className={`border-b border-ivory-border last:border-0 ${outOfStock ? 'bg-ivory-muted/50' : ''}`}>
                    <button
                      onClick={() => !outOfStock && addToCart(p, 0)}
                      className={`w-full text-right px-4 py-3 text-sm flex justify-between items-center ${outOfStock ? 'cursor-default opacity-70' : 'hover:bg-ivory-muted'} ${highlightedResultIdx === resultIdx ? 'bg-primary-50 outline-none ring-2 ring-inset ring-primary-300' : ''}`}
                    >
                      <span className="text-ink-main font-medium">{p.product_name}</span>
                      <span className="flex items-center gap-2 text-ink-muted text-xs">
                        <span>{api.formatMoney(p.sale_price)}</span>
                        {outOfStock ? (
                          <span className="rounded-full bg-status-danger/10 px-2 py-0.5 text-xs font-medium text-status-danger">{t('pos.outOfStock')}</span>
                        ) : (
                          <span>{t('pos.available')}: {effectiveStock}{cartQty > 0 ? ` (${t('pos.inCart')}: ${cartQty})` : ''}</span>
                        )}
                        {lowStock && (
                          <span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-xs font-medium text-status-warning">{t('pos.lowStockAlert')}</span>
                        )}
                        {outOfStock && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleShowSubs(p.product_id); }}
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${subsFor === p.product_id ? 'border-primary-600 bg-primary-600 text-white' : 'border-primary-400 text-primary-700 hover:bg-primary-50'}`}
                          >
                            {t('pos.substitutes')}
                          </button>
                        )}
                      </span>
                    </button>
                    {/* Substitutes inline panel */}
                    {subsFor === p.product_id && (
                      <div className="border-t border-ivory-border bg-primary-50/50 px-4 py-2">
                        {subsLoading ? (
                          <p className="text-xs text-ink-muted py-1">{t('common.loading')}</p>
                        ) : subsResults.length === 0 ? (
                          <p className="text-xs text-ink-muted py-1">{t('products.noSubstitutes')}</p>
                        ) : (
                          <ul className="space-y-1">
                            {subsResults.map(sub => {
                              const subStock = sub.batches.reduce((s, b) => s + b.quantity_current, 0);
                              return (
                                <li key={sub.product_id}>
                                  <button
                                    type="button"
                                    onClick={() => { if (subStock > 0) addToCart(sub, 0); }}
                                    className={`w-full flex justify-between items-center rounded-lg px-2 py-1.5 text-xs ${subStock > 0 ? 'hover:bg-primary-100 cursor-pointer' : 'opacity-60 cursor-default'}`}
                                  >
                                    <span className="font-medium text-ink-main">{sub.product_name}</span>
                                    <span className={`font-medium ${subStock > 0 ? 'text-status-success' : 'text-status-danger'}`}>
                                      {subStock > 0 ? `${t('pos.available')}: ${subStock}` : t('pos.outOfStock')}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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

        {/* Cart table */}
        <div className="app-card flex-1 overflow-y-auto min-h-0">
          {cart.length === 0 ? (
            <div className="text-center py-20 text-ink-muted">{t('pos.emptyCart')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-ivory-app border-b border-ivory-border">
                  <th className="px-3 py-2 text-right font-medium text-ink-muted">{t('pos.product')}</th>
                  <th className="px-3 py-2 text-right font-medium text-ink-muted w-[100px]">{t('pos.price')}</th>
                  <th className="px-3 py-2 text-center font-medium text-ink-muted w-[130px]">{t('pos.quantity')}</th>
                  <th className="px-3 py-2 text-right font-medium text-ink-muted w-[100px]">{t('pos.total')}</th>
                  <th className="px-3 py-2 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map(item => (
                  <tr
                    key={item.batch_id}
                    onClick={() => setSelectedCartBatch(item.batch_id)}
                    className={`border-b border-ivory-border cursor-pointer ${
                      selectedCartBatch === item.batch_id
                        ? 'bg-primary-50 ring-2 ring-inset ring-primary-300'
                        : 'bg-white hover:bg-ivory-muted'
                    }`}
                  >
                    <td className="px-3 py-2 text-ink-main font-medium">
                      <div>{item.product_name}</div>
                      {item.max_quantity - item.quantity <= 2 && (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
                          <AlertTriangle size={9} />{t('pos.lowStockAlert')}
                        </span>
                      )}
                      {item.expiry_date && (() => {
                        const exp = new Date(item.expiry_date);
                        const now = new Date();
                        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
                        if (daysLeft <= 0) return (
                          <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-status-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-status-danger">
                            <AlertTriangle size={9} />{t('pos.expired')}
                          </span>
                        );
                        if (daysLeft <= 90) return (
                          <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
                            <AlertTriangle size={9} />{t('pos.expiresInDays', { days: daysLeft })}
                          </span>
                        );
                        return null;
                      })()}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-muted">{api.formatMoney(item.unit_price)}</td>
                    <td className="relative px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateQty(item.batch_id, -1)} className="p-1.5 text-ink-muted hover:text-status-danger rounded active:bg-status-danger-bg"><Minus size={14} /></button>
                        <button
                          onClick={() => setEditingQtyBatch(editingQtyBatch === item.batch_id ? null : item.batch_id)}
                          className="w-10 text-center tabular-nums text-ink-main font-medium py-1 rounded hover:bg-primary-100 active:bg-primary-100"
                        >{item.quantity}</button>
                        <button onClick={() => updateQty(item.batch_id, 1)} className="p-1.5 text-ink-muted hover:text-primary-600 rounded active:bg-primary-100"><Plus size={14} /></button>
                      </div>
                      {editingQtyBatch === item.batch_id && (
                        <div className="absolute end-0 top-full z-40 mt-1">
                          <Numpad
                            initialValue={item.quantity}
                            maxValue={item.max_quantity}
                            decimals={0}
                            onConfirm={v => {
                              const qty = Math.max(1, Math.min(item.max_quantity, Math.round(v)));
                              setCart(prev => prev.map(c => c.batch_id === item.batch_id ? { ...c, quantity: qty } : c));
                              setEditingQtyBatch(null);
                            }}
                            onCancel={() => setEditingQtyBatch(null)}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-main font-medium">{api.formatMoney(item.quantity * item.unit_price)}</td>
                    <td className="px-1 py-2">
                      <button onClick={() => removeFromCart(item.batch_id)} className="p-1 text-ink-muted hover:text-status-danger"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-ink-placeholder">
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
              {t('pos.salesCount')}: {session.sales_count} | {api.formatMoney(session.total_sales)}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowReceiptCustomizer(true)} className="p-1.5 text-ink-muted hover:text-primary-600" title={t('pos.receiptCustomizerTitle')}><ReceiptText size={16} /></button>
            <button onClick={() => setShowReturnModal(true)} className="p-1.5 text-ink-muted hover:text-status-warning" title={t('pos.returns')}><RotateCcw size={16} /></button>
            <button onClick={loadHistory} className="p-1.5 text-ink-muted hover:text-primary-600" title={t('pos.history')}><History size={16} /></button>
            <button onClick={() => setShowCloseModal(true)} className="p-1.5 text-ink-muted hover:text-status-danger" title={t('pos.closeSession')}><LogOut size={16} /></button>
          </div>
        </div>

        {/* Total + Discount */}
        <div className="rounded-2xl bg-primary-600 text-ivory-surface px-4 py-4 shadow-[var(--shadow-card)]">
          {cartDiscount > 0 && (
            <div className="flex justify-between text-xs opacity-80 mb-1">
              <span>{t('pos.subtotal')}</span>
              <span className="tabular-nums">{api.formatMoney(cartTotal)}</span>
            </div>
          )}
          {cartDiscount > 0 && (
            <div className="flex justify-between text-xs opacity-80 mb-1">
              <span>{t('pos.discount')}</span>
              <span className="tabular-nums text-yellow-300">-{api.formatMoney(cartDiscount)}</span>
            </div>
          )}
          <div className="text-xs opacity-80 mb-1 text-center">{t('pos.grandTotal')}</div>
          <div className="text-3xl font-bold tabular-nums text-center">{api.formatMoney(finalTotal)}</div>
          {/* Discount input */}
          <div className="mt-3 flex items-center gap-1">
            <button
              onClick={() => {
                const wasFlat = discountMode === 'flat';
                setDiscountMode(wasFlat ? 'pct' : 'flat');
                setDiscountInput('');
                setCartDiscount(0);
              }}
              className="flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-[11px] text-ivory-surface hover:bg-white/20"
            >
              {discountMode === 'flat' ? <Tag size={11} /> : <Percent size={11} />}
              {discountMode === 'flat' ? t('common.currency') : '%'}
            </button>
            <input
              type="number"
              min={0}
              placeholder={t('pos.discountPlaceholder')}
              value={discountInput}
              onChange={e => {
                const raw = e.target.value;
                setDiscountInput(raw);
                const num = parseFloat(raw);
                if (isNaN(num) || num < 0) { setCartDiscount(0); return; }
                if (discountMode === 'flat') {
                  setCartDiscount(Math.round(num * 100));
                } else {
                  const pct = Math.min(100, num);
                  setCartDiscount(Math.round(cartTotal * pct / 100));
                }
              }}
              className="flex-1 rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-sm tabular-nums text-ivory-surface placeholder:text-ivory-surface/50 focus:outline-none focus:border-white/60"
            />
          </div>
        </div>

        {/* Payment methods + inputs */}
        <div className="app-card p-3 flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto -mx-3 px-3">
            <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => { setPaymentMethod('cash'); setPaymentMethodId(''); }}
              className={`min-w-[80px] flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                paymentMethod === 'cash' ? 'bg-primary-600 text-ivory-surface border-primary-600' : 'bg-ivory-surface text-ink-muted border-ivory-border hover:bg-primary-100'
              }`}><Banknote size={16} />{t('pos.cash')}</button>
            {bankMethods.map(pm => (
              <button key={pm.id}
                onClick={() => { setPaymentMethod('bank_transfer'); setPaymentMethodId(pm.id); }}
                className={`min-w-[80px] flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                  paymentMethod === 'bank_transfer' && paymentMethodId === pm.id ? 'bg-primary-600 text-ivory-surface border-primary-600' : 'bg-ivory-surface text-ink-muted border-ivory-border hover:bg-primary-100'
                }`}><Smartphone size={16} />{pm.name_ar || pm.name}</button>
            ))}
            <button
              onClick={() => { setPaymentMethod('credit'); setPaymentMethodId(''); }}
              className={`min-w-[80px] flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                paymentMethod === 'credit' ? 'bg-status-warning text-ivory-surface border-status-warning' : 'bg-ivory-surface text-ink-muted border-ivory-border hover:bg-primary-100'
              }`}><FileText size={16} />{t('customers.credit')}</button>
            <button
              onClick={() => { setPaymentMethod('split'); setPaymentMethodId(''); }}
              className={`min-w-[80px] flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                paymentMethod === 'split' ? 'bg-emerald-600 text-ivory-surface border-emerald-600' : 'bg-ivory-surface text-ink-muted border-ivory-border hover:bg-primary-100'
              }`}><Wallet size={16} />{t('pos.splitPayment')}</button>
          </div>

          {(paymentMethod === 'credit' || (paymentMethod === 'split' && splitRemaining > 0)) && (
            <div className="mb-3">
              <label className="block text-xs text-ink-muted mb-1">{t('customers.title')}</label>
              <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder={t('common.search')}
                className="app-input mb-2 w-full px-3 py-2 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
              <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}
                className="app-input w-full px-3 py-3 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
                <option value="">{t('common.search')}...</option>
                {filteredCustomers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name_ar || c.name}  {t('customers.balance')}: {api.formatMoney(c.current_balance)} / {api.formatMoney(c.credit_limit)}
                  </option>
                ))}
              </select>
              {/* Credit limit gauge */}
              {selectedCustomerId && (() => {
                const cust = customers.find(c => c.id === selectedCustomerId);
                if (!cust) return null;
                const remaining = Math.max(0, cust.credit_limit - cust.current_balance);
                const afterSale = remaining - finalTotal;
                const used = cust.credit_limit > 0 ? Math.min(100, (cust.current_balance / cust.credit_limit) * 100) : 0;
                const willExceed = finalTotal > remaining;
                return (
                  <div className="mt-2 p-2 rounded-xl border border-ivory-border bg-ivory-muted text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-ink-muted">{t('pos.creditRemaining')}:</span>
                      <span className={`tabular-nums font-bold ${willExceed ? 'text-status-danger' : 'text-status-success'}`}>
                        {api.formatMoney(remaining)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ivory-border overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${used > 80 ? 'bg-status-danger' : used > 50 ? 'bg-status-warning' : 'bg-status-success'}`}
                        style={{ width: `${used}%` }} />
                    </div>
                    {willExceed && (
                      <div className="mt-1 flex items-center gap-1 text-status-danger">
                        <AlertTriangle size={10} />
                        <span>{t('pos.creditExceeded', { amount: api.formatMoney(afterSale * -1) })}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {paymentMethod === 'split' && (
            <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink-main">{t('pos.splitPayment')}</div>
                  <div className="text-xs text-ink-muted">{t('pos.splitPaymentHint')}</div>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <div>{t('pos.paid')}: <span className="font-semibold text-ink-main">{api.formatMoney(splitPaidTotal)}</span></div>
                  <div>{t('pos.remaining')}: <span className={`font-semibold ${splitRemaining > 0 ? 'text-status-warning' : 'text-status-success'}`}>{api.formatMoney(splitRemaining)}</span></div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">{t('pos.cash')}</label>
                  <NumericInput value={normalizedSplitCashAmount / 100} onChange={value => setSplitCashAmount(Math.max(0, Math.round(value * 100)))} min={0} step={0.01} className="text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">{t('pos.bankTransfer')}</label>
                  <select
                    value={splitBankMethodId}
                    onChange={event => setSplitBankMethodId(event.target.value)}
                    className="app-input mb-2 w-full px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">{t('pos.chooseBankMethod')}</option>
                    {bankMethods.map((method) => (
                      <option key={method.id} value={method.id}>{method.name_ar || method.name}</option>
                    ))}
                  </select>
                  <NumericInput value={normalizedSplitBankAmount / 100} onChange={value => setSplitBankAmount(Math.max(0, Math.round(value * 100)))} min={0} step={0.01} className="text-sm" />
                </div>
              </div>

              {normalizedSplitBankAmount > finalTotal && (
                <div className="mt-2 rounded-xl bg-status-danger/10 px-3 py-2 text-xs font-medium text-status-danger">
                  {t('pos.splitPaymentTooHigh')}
                </div>
              )}
              {splitCashChange > 0 && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-primary-50 border border-primary-200 px-3 py-2">
                  <span className="text-xs font-medium text-ink-muted">{t('pos.change')}</span>
                  <span className="text-sm font-bold text-primary-600 tabular-nums">{api.formatMoney(splitCashChange)}</span>
                </div>
              )}
              {splitRemaining > 0 && (
                <div className="mt-2 rounded-xl bg-status-warning/10 px-3 py-2 text-xs font-medium text-status-warning">
                  {t('pos.splitPaymentRemainderCredit', { amount: api.formatMoney(splitRemaining) })}
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'cash' && (
            <div className="mb-3">
              <label className="block text-xs text-ink-muted mb-1">{t('pos.amountPaid')}</label>
              <NumericInput value={amountPaid / 100} onChange={v => setAmountPaid(Math.round(v * 100))} min={0} step={0.01} className="text-lg text-center" />
              {amountPaid > 0 && (
                <div className="mt-2 flex justify-between text-sm px-1">
                  <span className="text-ink-muted">{t('pos.change')}</span>
                  <span className={`tabular-nums font-bold ${change >= 0 ? 'text-primary-600' : 'text-status-danger'}`}>
                    {api.formatMoney(Math.max(0, change))}
                  </span>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'cash' && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              {quickCashAmounts.map((amt, i) => (
                <button key={i} onClick={() => setAmountPaid(amt)}
                  className="rounded-xl border border-ivory-border bg-ivory-muted py-2 text-xs text-ink-muted active:bg-primary-100 tabular-nums">
                  {api.formatMoney(amt)}
                </button>
              ))}
            </div>
          )}

          {paymentMethod === 'cash' && (
            <div className="flex justify-center mb-3">
              <Numpad initialValue={amountPaid > 0 ? amountPaid / 100 : 0} decimals={2}
                isActive={editingQtyBatch === null}
                onConfirm={v => setAmountPaid(Math.round(v * 100))} onCancel={() => setAmountPaid(0)} />
            </div>
          )}

            <div className="mb-3">
              <label className="mb-1 block text-xs text-ink-muted">{t('pos.notes')}</label>
              <textarea
                value={saleNote}
                onChange={event => setSaleNote(event.target.value)}
                placeholder={t('pos.notesPlaceholder')}
                className="app-input h-24 w-full resize-none px-3 py-2 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-ivory-border mt-auto">
            <Button onClick={handleSale} disabled={saving || cart.length === 0 || isBlocked}
              className="w-full py-3 text-base" title={isBlocked ? t('settings.license.featureLocked') : undefined}>
              {saving ? t('common.loading') : t('pos.completeSale')} (F12)
            </Button>
          </div>
        </div>
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
      <ReturnModal session={session} onClose={() => setShowReturnModal(false)} onSuccess={loadSession} />
    )}

    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    {showRxModal && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowRxModal(false)} />
        <div className="relative bg-ivory-app rounded-2xl shadow-[var(--shadow-float)] w-full max-w-sm mx-4 p-6">
          <h3 className="font-bold text-ink-main mb-1">{t('pos.rxTitle')}</h3>
          <p className="text-sm text-ink-muted mb-4">{t('pos.rxHint')}</p>
          <label className="block text-xs font-medium text-ink-main mb-1" htmlFor="rx-pharmacist-id">
            {t('pos.rxPharmacistId')}
          </label>
          <input
            id="rx-pharmacist-id"
            className="inp w-full mb-4"
            placeholder={t('pos.rxPharmacistPlaceholder')}
            value={rxPharmacistId}
            onChange={e => setRxPharmacistId(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              className="px-4 py-2 rounded-xl text-sm text-ink-muted hover:bg-ivory-muted"
              onClick={() => { setShowRxModal(false); setRxPharmacistId(''); }}
            >
              {t('common.cancel')}
            </button>
            <button
              className="px-4 py-2 rounded-xl text-sm bg-forest-600 text-white font-medium disabled:opacity-40"
              disabled={!rxPharmacistId.trim() || saving}
              onClick={() => doCompleteSale(rxPharmacistId.trim())}
            >
              {saving ? t('common.loading') : t('pos.rxConfirm')}
            </button>
          </div>
        </div>
      </div>
    )}

    {showReceiptCustomizer && (
      <ReceiptCustomizerModal
        header={receiptHeader}
        footer={receiptFooter}
        printLogo={receiptPrintLogo}
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
