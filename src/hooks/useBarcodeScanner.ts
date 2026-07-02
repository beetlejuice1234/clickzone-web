import { useEffect, useRef } from 'react';

export function useBarcodeScanner(onScan: (scannedString: string) => void) {
 const bufferRef = useRef('');
 const lastTimeRef = useRef(0);

 useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent) => {
  // Don't intercept if user is typing in an input/textarea/contenteditable
  const active = document.activeElement;
  if (active && (
    active.tagName === 'INPUT' || 
    active.tagName === 'TEXTAREA' || 
    active.tagName === 'SELECT' ||
    (active as HTMLElement).isContentEditable
  )) {
    return; // Let the input handle it normally
  }

  const now = performance.now();
  const timeDiff = now - lastTimeRef.current;
  
  // If time between keystrokes is more than 50ms, assume it's human typing and reset.
  if (timeDiff > 50) {
  bufferRef.current = '';
  }
  
  lastTimeRef.current = now;

  if (e.key === 'Enter') {
  if (bufferRef.current.length > 5) {
  e.preventDefault();
  onScan(bufferRef.current);
  bufferRef.current = '';
  }
  } else if (e.key.length === 1) {
  bufferRef.current += e.key;
  }
 };

 window.addEventListener('keydown', handleKeyDown);
 return () => {
 window.removeEventListener('keydown', handleKeyDown);
 };
 }, [onScan]);
}
