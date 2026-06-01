import { useState, useCallback } from 'react';

export function usePosVerification() {
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyCounts, setVerifyCounts] = useState({ sold: 0, lowStock: 0 });
  const [cashError, setCashError] = useState<string | null>(null);

  const openVerifyConfirm = useCallback((counts: { sold: number; lowStock: number }) => {
    setVerifyCounts(counts);
    setShowVerifyConfirm(true);
  }, []);

  const closeVerifyConfirm = useCallback(() => setShowVerifyConfirm(false), []);

  const openVerifyModal = useCallback(() => {
    setShowVerifyConfirm(false);
    setShowVerifyModal(true);
  }, []);

  const closeVerifyModal = useCallback(() => setShowVerifyModal(false), []);

  return {
    showVerifyConfirm, showVerifyModal, verifyLoading, setVerifyLoading,
    verifyCounts, cashError, setCashError,
    openVerifyConfirm, closeVerifyConfirm, openVerifyModal, closeVerifyModal,
  };
}
