import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles, requiredPermission }) => {
    const { user, loading, hasPermission } = useAuth();

    if (loading) return <div>Loading...</div>;

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Active SDS Coordinator (Admin) has full system-wide access
    if (user.role === 'admin') {
        return children;
    }

    // Check permission-based requirement if specified
    if (requiredPermission) {
        const perms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
        const hasAccess = perms.some((p) => hasPermission(p));
        if (hasAccess) {
            return children;
        }
    }

    // Role-based fallback
    if (allowedRoles && allowedRoles.includes(user.role)) {
        return children;
    }

    // If requirements are defined but not met, redirect
    if (requiredPermission || allowedRoles) {
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;
