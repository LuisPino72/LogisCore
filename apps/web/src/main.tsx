import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const _log = console.log;
console.log = (...args: unknown[]) => {
  if (args.length > 0 && typeof args[0] === 'string') {
    if (args[0].includes('Download the React DevTools')) return;
    if (args[0].includes('Router is responding to')) return;
  }
  _log(...args);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);