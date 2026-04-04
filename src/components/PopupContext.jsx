import { createContext, useContext, useState } from 'react';
import Popup from './Popup';

const PopupContext = createContext();

/**
 * PopupProvider Component
 * Provides popup functionality throughout the app
 */
export function PopupProvider({ children }) {
    const [popup, setPopup] = useState(null);

    const showPopup = (message, type = 'info', duration = 0) => {
        setPopup({ message, type, duration });
    };

    const hidePopup = () => {
        setPopup(null);
    };

    // Auto-hide success messages after 3 seconds
    const showSuccess = (message, duration = 3000) => {
        showPopup(message, 'success', duration);
    };

    const showError = (message, duration = 0) => {
        showPopup(message, 'error', duration);
    };

    const showWarning = (message, duration = 0) => {
        showPopup(message, 'warning', duration);
    };

    const showInfo = (message, duration = 0) => {
        showPopup(message, 'info', duration);
    };

    return (
        <PopupContext.Provider value={{
            showPopup,
            showSuccess,
            showError,
            showWarning,
            showInfo,
            hidePopup
        }}>
            {children}
            {popup && (
                <Popup
                    message={popup.message}
                    type={popup.type}
                    onClose={hidePopup}
                    duration={popup.duration}
                />
            )}
        </PopupContext.Provider>
    );
}

/**
 * Custom hook to use popup functionality
 */
export function usePopup() {
    const context = useContext(PopupContext);
    if (!context) {
        throw new Error('usePopup must be used within a PopupProvider');
    }
    return context;
}