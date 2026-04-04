import { useEffect } from 'react';
import './Popup.css';

/**
 * Popup Component
 * A modern, styled popup/modal to replace ugly browser alerts
 */
export default function Popup({ message, type = 'info', onClose, duration = 0 }) {
    // Auto-close after duration if specified
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success':
                return '✓';
            case 'error':
                return '✗';
            case 'warning':
                return '⚠';
            default:
                return 'ℹ';
        }
    };

    const getTypeClass = () => {
        switch (type) {
            case 'success':
                return 'popup-success';
            case 'error':
                return 'popup-error';
            case 'warning':
                return 'popup-warning';
            default:
                return 'popup-info';
        }
    };

    return (
        <div className="popup-overlay" onClick={onClose}>
            <div className={`popup-content ${getTypeClass()}`} onClick={(e) => e.stopPropagation()}>
                <div className="popup-header">
                    <button className="popup-close" onClick={onClose}>×</button>
                </div>
                <div className="popup-message">
                    {message}
                </div>
                <div className="popup-actions">
                    <button className="popup-btn" onClick={onClose}>OK</button>
                </div>
            </div>
        </div>
    );
}