import { OverallTab } from '../components/dashboard/tabs/OverallTab';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import { useAuth } from '../contexts/AuthContext';

export const Dashboard = () => {
  const { isLimited } = useAuth();

  return isLimited ? <OverallTab /> : <AdminDashboard />;
};
