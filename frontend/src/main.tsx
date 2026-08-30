import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import Overview from './pages/Overview.tsx';
import Watchlist from './pages/Watchlist.tsx';
import News from './pages/News.tsx';
import Chat from './pages/Chat.tsx';
import Macro from './pages/Macro.tsx';
import Portfolio from './pages/Portfolio.tsx';
import Calendar from './pages/Calendar.tsx';
import Settings from './pages/Settings.tsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'watchlist', element: <Watchlist /> },
      { path: 'news', element: <News /> },
      { path: 'chat', element: <Chat /> },
      { path: 'macro', element: <Macro /> },
      { path: 'portfolio', element: <Portfolio /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
