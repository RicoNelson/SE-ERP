import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Sell from './pages/Sell';
import Stock from './pages/Stock';
import StockAdd from './pages/StockAdd';
import StockPbManage from './pages/StockPbManage';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import Users from './pages/Users';
import Notifications from './pages/Notifications';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Sell />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/stock/add" element={<StockAdd />} />
            <Route path="/stock/pb" element={<StockPbManage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/users" element={<Users />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
