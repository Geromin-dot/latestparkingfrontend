import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PopupProvider } from './components/PopupContext';
import Login from './pages/Login';
import UserDashboard from './pages/UserDashboard';
import AdminPanel from './pages/AdminPanel';
import './App.css';

function App() {
  return (
    <PopupProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/user" element={<UserDashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </Router>
    </PopupProvider>
  );
}

export default App;