import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import { usePopup } from '../components/PopupContext';

/**
 * UserDashboard Component
 * Main user interface for parking applications and parking access.
 * Features: Application submission, status tracking, parking access, profile management.
 */
export default function UserDashboard() {
    const navigate = useNavigate();
    const { showError, showSuccess, showInfo } = usePopup();

    // User and application data
    const [user, setUser] = useState(null);
    const [records, setRecords] = useState([]);

    // Form and UI state
    const [plate, setPlate] = useState('');
    const [type, setType] = useState('4-Wheels');
    const [showNotif, setShowNotif] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Profile update state
    const [newPassword, setNewPassword] = useState('');
    const [newIdentifier, setNewIdentifier] = useState('');

    // Parking functionality state
    const [activeTab, setActiveTab] = useState('applications');
    const [parkingSlots, setParkingSlots] = useState([]);
    const [stickers, setStickers] = useState([]);

    // Parking form state
    const [stickerInput, setStickerInput] = useState('');
    const [slotInput, setSlotInput] = useState('');
    const [leaveIdentifier, setLeaveIdentifier] = useState('');

    // Dropdown data
    const strands = ["STEM", "ABM", "HUMSS", "GAS", "TVL"];
    const courses = ["BSIT", "BSCS", "BSBA", "BSCrim", "BSHM", "BSA", "BSED"];

    /**
     * Decrypt DES-encrypted data using the application secret key.
     */
    const decryptData = (ciphertext) => {
        try {
            const bytes = CryptoJS.DES.decrypt(ciphertext, 'UA-SECRET-KEY');
            return bytes.toString(CryptoJS.enc.Utf8) || ciphertext;
        } catch (e) { return ciphertext; }
    };

    /**
     * Get plate number from sticker ID by looking up user applications.
     */
    const getPlateFromSticker = (stickerId) => {
        if (!records || records.length === 0) return null;
        const normalizedStickerId = (stickerId || '').trim().toUpperCase();
        const today = new Date();
        const application = records.find(r =>
            r.status === 'Approved' &&
            r.expiration_date &&
            new Date(r.expiration_date) > today &&
            (r.sticker_id || '').trim().toUpperCase() === normalizedStickerId
        );
        return application ? decryptData(application.plate_number) : null;
    };

    /**
     * Get valid, non-expired sticker IDs for the current user.
     */
    const getValidUserStickers = () => {
        if (!records || records.length === 0) return [];
        const today = new Date();
        return [...new Set(records
            .filter(r => r.status === 'Approved' && r.expiration_date && new Date(r.expiration_date) > today)
            .map(r => (r.sticker_id || '').trim().toUpperCase())
            .filter(id => id))];
    };

    /**
     * Initialize user session and fetch application records.
     * Redirects to login if no valid session exists.
     */
    useEffect(() => {
        const savedUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!savedUser) {
            navigate('/');
        } else {
            setUser(savedUser);
            setNewIdentifier(savedUser.identifier || '');
            fetchUserRecords(savedUser.username);
        }
    }, [navigate]);

    /**
     * Load parking slots and valid stickers from localStorage.
     */
    useEffect(() => {
        const savedSlots = localStorage.getItem('parkingSlots');
        if (savedSlots) {
            setParkingSlots(JSON.parse(savedSlots));
        } else {
            const initialSlots = Array.from({ length: 10 }, (_, i) => ({
                id: i + 1,
                status: 'available',
                plateNumber: '',
                stickerId: '',
                entryTime: null
            }));
            setParkingSlots(initialSlots);
            localStorage.setItem('parkingSlots', JSON.stringify(initialSlots));
        }
        const savedStickers = localStorage.getItem('validParkingStickers');
        if (savedStickers) {
            setStickers(JSON.parse(savedStickers));
        } else {
            setStickers([]);
        }
    }, []);

    /**
     * Fetch user's vehicle application records from backend.
     */
    const fetchUserRecords = async (username) => {
        try {
            const res = await axios.get(`http://127.0.0.1:8000/api/user-records/?username=${username}`);
            setRecords(res.data);
        } catch (err) {
            console.error("User fetch error:", err);
        }
    };

    /**
     * Park a vehicle in a specific slot after validating sticker ID.
     * Updates parking state and localStorage.
     */
    const parkVehicle = (slotId, plateNumber, stickerId) => {
        const normalizedStickerId = (stickerId || '').trim().toUpperCase();
        const currentStickers = getValidUserStickers();
        if (!currentStickers.includes(normalizedStickerId)) {
            showError(`Invalid sticker ID. Valid approved stickers: ${currentStickers.join(', ') || 'None available - please contact admin'}`);
            return false;
        }
        const updatedSlots = parkingSlots.map(slot =>
            slot.id === slotId ? { ...slot, status: 'occupied', plateNumber, stickerId: normalizedStickerId, entryTime: new Date().toISOString() } : slot
        );
        setParkingSlots(updatedSlots);
        localStorage.setItem('parkingSlots', JSON.stringify(updatedSlots));
        showSuccess(`Vehicle ${plateNumber} parked in slot ${slotId}`);
        return true;
    };

    /**
     * Handle parking vehicle with proper form validation.
     */
    const handleParkVehicle = () => {
        if (!stickerInput.trim()) {
            showError('Please enter a sticker ID');
            return;
        }
        if (!slotInput.trim()) {
            showError('Please enter a slot number');
            return;
        }

        const sticker = stickerInput.trim().toUpperCase();
        const slot = parseInt(slotInput.trim());

        const plateNumber = getPlateFromSticker(sticker);
        if (!plateNumber) {
            showError('Invalid sticker ID or application not approved/expired');
            return;
        }

        const availableSlots = parkingSlots.filter(s => s.status === 'available');
        if (availableSlots.length === 0) {
            showError('No available slots');
            return;
        }

        if (availableSlots.find(s => s.id === slot)) {
            if (parkVehicle(slot, plateNumber, sticker)) {
                setStickerInput('');
                setSlotInput('');
            }
        } else {
            showError('Invalid slot number');
        }
    };

    /**
     * Remove vehicle from parking by slot number or plate number.
     */
    const leaveParking = (identifier) => {
        const trimmed = (identifier || '').trim();
        const normalized = trimmed.toUpperCase();

        let slot = null;
        if (/^\d+$/.test(trimmed)) {
            const slotId = parseInt(trimmed, 10);
            slot = parkingSlots.find(s => s.id === slotId && s.status === 'occupied');
        } else {
            slot = parkingSlots.find(
                s => (s.plateNumber || '').trim().toUpperCase() === normalized && s.status === 'occupied'
            );
        }

        if (!slot) {
            showError('Vehicle or slot not found, or slot is already available.');
            return;
        }

        const updatedSlots = parkingSlots.map(s =>
            s.id === slot.id ? { ...s, status: 'available', plateNumber: '', stickerId: '', entryTime: null } : s
        );
        setParkingSlots(updatedSlots);
        localStorage.setItem('parkingSlots', JSON.stringify(updatedSlots));
        showInfo(`Vehicle ${slot.plateNumber} left slot ${slot.id} successfully.`);
    };

    /**
     * Handle leaving parking with proper form validation.
     */
    const handleLeaveParking = () => {
        if (!leaveIdentifier.trim()) {
            showError('Please enter plate number or slot number');
            return;
        }
        leaveParking(leaveIdentifier.trim());
        setLeaveIdentifier('');
    };

    // Get unread notifications (applications with status updates)
    const notifications = records.filter(r => r.is_seen === false);

    /**
     * Handle Enter key press for application form
     */
    const handleApplicationKeyPress = (e) => {
        if (e.key === 'Enter') {
            submitApp(e);
        }
    };

    /**
     * Mark all notifications as read for the current user.
     */
    const markAsRead = async () => {
        try {
            await axios.post('http://127.0.0.1:8000/api/mark-notifications-read/', {
                username: user.username
            });
            fetchUserRecords(user.username);
            setShowNotif(false);
        } catch (err) {
            console.error("Could not mark as read:", err);
        }
    };

    // 3. Update Profile Logic
    const handleUpdateProfile = async () => {
        try {
            const updateData = {
                username: user.username,
                identifier: newIdentifier,
            };
            
            // Keep your working password logic
            if (newPassword) {
                updateData.password = newPassword.trim();
            }

            await axios.post('http://127.0.0.1:8000/api/update-profile/', updateData);
            
            if (newPassword) {
                showSuccess("Password changed! Please log in again.");
                localStorage.removeItem('currentUser');
                navigate('/');
            } else {
                const updatedUser = { ...user, identifier: newIdentifier };
                localStorage.setItem('currentUser', JSON.stringify(updatedUser));
                setUser(updatedUser);
                showSuccess("Profile updated successfully!");
                setShowSettings(false);
            }
        } catch (err) {
            showError("Update failed. Check backend connection.");
        }
    };

    // 4. Submit Application
    const submitApp = async (e) => {
        e.preventDefault();
        if(!plate) return showError("Please enter Plate Number.");

        const displayFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
        const encPlate = CryptoJS.DES.encrypt(plate, 'UA-SECRET-KEY').toString();
        const encOwner = CryptoJS.DES.encrypt(displayFullName, 'UA-SECRET-KEY').toString();
        
        try {
            await axios.post('http://127.0.0.1:8000/api/submit-vehicle/', {
                username: user.username,
                ownerName: encOwner,
                plateNumber: encPlate,
                vehicleType: type
            });
            showSuccess("Application Sent!");
            setPlate('');
            fetchUserRecords(user.username);
        } catch (err) {
            showError("Submission failed.");
        }
    };

    if (!user) return null;

    const isGuest = user.role?.toLowerCase() === 'guest';
    const displayFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;

    return (
        <div className="center">
            <div className="card dashboard-card">
                <div className="topbar">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <h2 style={{ margin: 0 }}>Welcome, <span style={{ color: '#6366f1' }}>{displayFullName}</span></h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <p className="subtitle" style={{ margin: 0 }}>UA Parking Portal •</p>
                            <span className={`role-badge ${isGuest ? 'guest-tag' : 'student-tag'}`}>
                                {user.role?.toUpperCase() || 'USER'}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
                        <button className="btn-gray slim" onClick={() => setShowSettings(true)}>⚙️</button>

                        <button className="btn-gray slim bell-btn" onClick={() => setShowNotif(!showNotif)}>
                            🔔
                            {notifications.length > 0 && <span className="notif-count">{notifications.length}</span>}
                        </button>

                        {showNotif && (
                            <div className="notif-dropdown">
                                <h4>Recent Updates</h4>
                                {notifications.length === 0 ? (
                                    <p className="empty-notif">No new notifications.</p>
                                ) : (
                                    notifications.slice().reverse().map((n, i) => (
                                        <div key={i} className="notif-item">
                                            Vehicle <strong>{decryptData(n.plate_number)}</strong> has been 
                                            <strong className={n.status === 'Approved' ? 'text-green' : 'text-red'}> {n.status}</strong>.
                                        </div>
                                    ))
                                )}
                                {notifications.length > 0 && (
                                    <button className="link-btn mark-read" onClick={markAsRead}>Mark as Read</button>
                                )}
                            </div>
                        )}

                        <button className="btn-blue slim" onClick={() => { localStorage.removeItem('currentUser'); navigate('/'); }}>
                            Logout
                        </button>
                    </div>
                </div>

                {/* TABS */}
                <div className="tabs" style={{ marginBottom: '20px' }}>
                    <button 
                        className={`tab-button ${activeTab === 'applications' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('applications')}
                    >
                        Applications
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'parking' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('parking')}
                    >
                        Parking
                    </button>
                </div>

                {activeTab === 'applications' && (
                <>

                {/* SETTINGS MODAL POPUP */}
                {showSettings && (
                    <div className="modal-overlay">
                        <div className="modal-content card" style={{ maxWidth: '450px', width: '90%' }}>
                            <h3 style={{ marginTop: 0 }}>Account Settings</h3>
                            <div style={{ textAlign: 'left', marginTop: '15px' }}>
                                
                                <label className="small-label">Change Password</label>
                                <input 
                                    type="password" 
                                    placeholder="Enter new password" 
                                    value={newPassword} 
                                    onChange={(e) => setNewPassword(e.target.value)} 
                                    style={{ marginBottom: '15px' }}
                                />

                                <hr style={{ border: '0.5px solid #e2e8f0', margin: '15px 0' }} />

                                {isGuest ? (
                                    <div>
                                        <label className="small-label">Purpose of Visit</label>
                                        <input 
                                            type="text" 
                                            value={newIdentifier} 
                                            onChange={(e) => setNewIdentifier(e.target.value)} 
                                        />
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div>
                                            <label className="small-label">Student ID (Permanent)</label>
                                            <input type="text" value={user.identifier.split(' | ')[0]} disabled className="disabled-input" />
                                        </div>
                                        <div>
                                            <label className="small-label">Update Level</label>
                                            <select 
                                                value={newIdentifier.includes('Senior High') ? 'Senior High' : 'College'} 
                                                onChange={(e) => {
                                                    const idPart = user.identifier.split(' | ')[0];
                                                    setNewIdentifier(`${idPart} | ${e.target.value} - `);
                                                }}
                                            >
                                                <option value="Senior High">Senior High</option>
                                                <option value="College">College</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="small-label">Select Course/Strand</label>
                                            <select 
                                                onChange={(e) => {
                                                    const base = newIdentifier.split(' - ')[0];
                                                    setNewIdentifier(`${base} - ${e.target.value}`);
                                                }}
                                            >
                                                <option value="">-- Choose --</option>
                                                {(newIdentifier.includes('Senior High') ? strands : courses).map(item => (
                                                    <option key={item} value={item}>{item}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <button className="btn-green" style={{ flex: 1 }} onClick={handleUpdateProfile}>Save Changes</button>
                                <button className="btn-gray" onClick={() => { setShowSettings(false); setNewPassword(''); }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* APPLICATION FORM */}
                <div className="panel">
                    <h3 className="panel-title">Apply for Parking Sticker</h3>
                    <form onSubmit={submitApp}>
                        <div className="form-row-single">
                            <div className="auto-field">
                                <label className="small-label">Registered Owner</label>
                                <input type="text" value={displayFullName} disabled className="disabled-input" />
                            </div>
                            <div className="input-field">
                                <label className="small-label">Plate Number</label>
                                <input 
                                    placeholder="Enter Plate Number" 
                                    value={plate} 
                                    onChange={e => setPlate(e.target.value)}
                                    onKeyDown={handleApplicationKeyPress}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
                            <div>
                                <label className="small-label">Vehicle Type</label>
                                <select value={type} onChange={e => setType(e.target.value)} style={{ margin: '7px 0' }}>
                                    <option value="2-Wheels">2-Wheels (₱1,000)</option>
                                    <option value="4-Wheels">4-Wheels (₱2,000)</option>
                                    <option value="Service">Service (₱3,000)</option>
                                </select>
                            </div>
                        </div>

                        <button type="submit" className="btn-purple submit-btn" style={{ width: '100%', marginTop: '15px' }}>
                            Submit Application
                        </button>
                    </form>
                </div>

                <div className="panel">
                    <h3 className="panel-title">My Application Records</h3>
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Plate Number</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Sticker ID</th>
                                    <th>Expires</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.length === 0 ? (
                                    <tr><td colSpan="5" className="empty-table">No records found.</td></tr>
                                ) : (
                                    records.slice().reverse().map((v, i) => (
                                        <tr key={i}>
                                            <td className="bold-plate">{decryptData(v.plate_number)}</td>
                                            <td>{v.vehicle_type}</td>
                                            <td>
                                                <span className={`status-badge ${v.status.toLowerCase()}`}>
                                                    {v.status}
                                                </span>
                                            </td>
                                            <td className="sticker-id">{v.sticker_id || '---'}</td>
                                            <td>
                                                {v.expiration_date ? (
                                                    <span style={{ 
                                                        color: new Date(v.expiration_date) < new Date() ? '#dc2626' : '#16a34a',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {new Date(v.expiration_date).toLocaleDateString()}
                                                    </span>
                                                ) : '---'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                </>)}

                {activeTab === 'parking' && (
                <>

                {/* PARKING MANAGEMENT */}
                <div className="panel">
                    <h3 className="panel-title">Parking Services</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                        {/* Park Vehicle Form */}
                        <div style={{ padding: '20px', border: '2px solid #3b82f6', borderRadius: '12px', backgroundColor: '#f8f9ff' }}>
                            <h4 style={{ margin: '0 0 20px 0', color: '#1e40af', fontSize: '16px', fontWeight: '600' }}>🅿️ Park Vehicle</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <label className="small-label" style={{ fontSize: '13px', fontWeight: '500', marginBottom: '6px', display: 'block' }}>Sticker ID</label>
                                    <input 
                                        type="text" 
                                        placeholder="Enter your sticker ID" 
                                        value={stickerInput}
                                        onChange={(e) => setStickerInput(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                                    />
                                </div>
                                <div>
                                    <label className="small-label" style={{ fontSize: '13px', fontWeight: '500', marginBottom: '6px', display: 'block' }}>Slot Number</label>
                                    <input 
                                        type="number" 
                                        placeholder="Select available slot" 
                                        value={slotInput}
                                        onChange={(e) => setSlotInput(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                                    />
                                </div>
                                <button className="btn-blue" onClick={handleParkVehicle} style={{ width: '100%', padding: '10px 0', marginTop: '5px' }}>Park Vehicle</button>
                                <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: '#dbeafe', borderRadius: '8px', fontSize: '13px', color: '#1e40af', fontWeight: '500' }}>
                                    📍 Available: {parkingSlots.filter(s => s.status === 'available').map(s => `#${s.id}`).join(', ') || 'None'}
                                </div>
                            </div>
                        </div>

                        {/* Leave Parking Form */}
                        <div style={{ padding: '20px', border: '2px solid #ef4444', borderRadius: '12px', backgroundColor: '#fff8f8' }}>
                            <h4 style={{ margin: '0 0 20px 0', color: '#991b1b', fontSize: '16px', fontWeight: '600' }}>🚗 Leave Parking</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <label className="small-label" style={{ fontSize: '13px', fontWeight: '500', marginBottom: '6px', display: 'block' }}>Plate Number or Slot</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g., ABC-1234 or 5" 
                                        value={leaveIdentifier}
                                        onChange={(e) => setLeaveIdentifier(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
                                    />
                                </div>
                                <button className="btn-red" onClick={handleLeaveParking} style={{ width: '100%', padding: '10px 0' }}>Leave Parking</button>
                                <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: '#fee2e2', borderRadius: '8px', fontSize: '13px', color: '#991b1b', fontWeight: '500' }}>
                                    ✅ Covered by active 1-year sticker
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="panel">
                    <h3 className="panel-title">Parking Slots Status</h3>
                    {parkingSlots.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                            <p style={{ fontSize: '14px' }}>No parking slots available</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
                            {parkingSlots.map(slot => (
                                <div 
                                    key={slot.id}
                                    style={{
                                        padding: '15px',
                                        border: `2px solid ${slot.status === 'available' ? '#16a34a' : '#dc2626'}`,
                                        borderRadius: '10px',
                                        textAlign: 'center',
                                        backgroundColor: slot.status === 'available' ? '#f0fdf4' : '#fef2f2',
                                    }}
                                >
                                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: slot.status === 'available' ? '#16a34a' : '#dc2626', marginBottom: '8px' }}>
                                        #{slot.id}
                                    </div>
                                    <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '8px', color: '#6b7280' }}>
                                        {slot.status === 'available' ? '✓ Available' : '✓ Occupied'}
                                    </div>
                                    {slot.plateNumber && (
                                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f2937', marginBottom: '4px' }}>
                                            {slot.plateNumber}
                                        </div>
                                    )}
                                    {slot.stickerId && (
                                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                                            {slot.stickerId}
                                        </div>
                                    )}
                                    {slot.entryTime && (
                                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                            {new Date(slot.entryTime).toLocaleTimeString()}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                </>)}

            </div>
        </div>
    );
}