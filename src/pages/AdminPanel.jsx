import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import { usePopup } from '../components/PopupContext';

/**
 * AdminPanel Component
 * Main administrative interface for managing parking applications and parking slots.
 * Features: Application approval/rejection, parking management, sticker validation.
 */
export default function AdminPanel() {
    const navigate = useNavigate();
    const { showError, showInfo } = usePopup();

    // Application management state
    const [records, setRecords] = useState([]);
    const [search, setSearch] = useState('');
    const [isDecrypted, setIsDecrypted] = useState(false);

    // Sticker verification state
    const [verifyInput, setVerifyInput] = useState('');
    const [activeVerify, setActiveVerify] = useState('');

    // UI state
    const [activeTab, setActiveTab] = useState('applications');

    // Parking management state
    const [parkingSlots, setParkingSlots] = useState([]);
    const [newSticker, setNewSticker] = useState('');
    const [parkStickerInput, setParkStickerInput] = useState('');

    /**
     * Get valid (non-expired) sticker IDs from approved applications.
     * Used for parking validation and access control.
     */
    const getValidStickers = () => {
        if (!records || records.length === 0) return [];
        const today = new Date();
        return [...new Set(records
            .filter(r => r.status === 'Approved' && r.expiration_date && new Date(r.expiration_date) > today)
            .map(r => (r.sticker_id || '').trim().toUpperCase())
            .filter(id => id))]; // Remove null/empty and deduplicate
    };

    /**
     * Get plate number from sticker ID by looking up approved applications.
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
     * Decrypt DES-encrypted data using the application secret key.
     */
    const decryptData = (ciphertext) => {
        try {
            const bytes = CryptoJS.DES.decrypt(ciphertext, 'UA-SECRET-KEY');
            return bytes.toString(CryptoJS.enc.Utf8) || ciphertext;
        } catch (e) { return ciphertext; }
    };

    /**
     * Fetch all vehicle applications from the backend.
     * Updates local state and localStorage with valid stickers.
     */
    const fetchData = async () => {
        try {
            const res = await axios.get('http://127.0.0.1:8000/api/admin-records/');
            const freshRecords = res.data || [];
            setRecords(freshRecords);
            // Update valid stickers from fresh response to avoid stale state issues
            const today = new Date();
            const validStickers = [...new Set(freshRecords
                .filter(r => r.status === 'Approved' && r.expiration_date && new Date(r.expiration_date) > today)
                .map(r => (r.sticker_id || '').trim().toUpperCase())
                .filter(id => id))];
            localStorage.setItem('validParkingStickers', JSON.stringify(validStickers));
        } catch (err) {
            console.error("Admin fetch error:", err);
            setRecords([]); // Set empty array on error
        }
    };

    // Initialize data on component mount
    useEffect(() => { fetchData(); }, []);

    // Initialize parking slots from localStorage or create default
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
    }, []);

    /**
     * Update application status (Approve/Reject/Reset).
     * Triggers backend update and refreshes data.
     */
    const handleUpdateStatus = async (id, status) => {
        try {
            await axios.post('http://127.0.0.1:8000/api/update-status/', { id, status });
            fetchData();
        } catch (err) { showError("Update failed"); }
    };

    // Sticker verification handlers
    const handleVerify = () => { setActiveVerify(verifyInput.trim().toUpperCase()); };
    const clearVerify = () => { setVerifyInput(''); setActiveVerify(''); };

    // Enter key handlers for better UX
    const handleVerifyKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleVerify();
        }
    };

    /**
     * Get application fee based on vehicle type.
     * 2-Wheels: ₱1,000, 4-Wheels: ₱2,000, Service: ₱3,000
     */
    const getFee = (type) => type?.includes("2") ? 1000 : (type?.includes("Service") ? 3000 : 2000);

    const handleSearchKeyPress = (e) => {
        if (e.key === 'Enter') {
            // Search is already handled by onChange, but Enter key provides immediate feedback
            setSearch(e.target.value.toLowerCase());
        }
    };

    const handleStickerCheckKeyPress = (e) => {
        if (e.key === 'Enter') {
            addSticker();
        }
    };

    /**
     * Validate sticker ID against approved applications.
     * Provides feedback on sticker validity.
     */
    const addSticker = () => {
        const normalized = (newSticker || '').trim().toUpperCase();
        if (normalized && !getValidStickers().includes(normalized)) {
            showError('This sticker ID is not from an approved application. Only approved application stickers can be used for parking.');
            setNewSticker('');
            return;
        }
        showInfo('Stickers are automatically managed from approved applications.');
        setNewSticker('');
    };

    /**
     * Park a vehicle in a specific slot.
     * Validates sticker ID and updates parking state.
     */
    const parkVehicle = (slotId, plateNumber, stickerId) => {
        const normalizedStickerId = (stickerId || '').trim().toUpperCase();
        const validStickers = getValidStickers();
        if (!validStickers.includes(normalizedStickerId)) {
            showError(`Invalid sticker ID. Valid approved stickers: ${validStickers.join(', ') || 'None available'}`);
            return false;
        }
        const updatedSlots = parkingSlots.map(slot =>
            slot.id === slotId ? { ...slot, status: 'occupied', plateNumber, stickerId: normalizedStickerId, entryTime: new Date().toISOString() } : slot
        );
        setParkingSlots(updatedSlots);
        localStorage.setItem('parkingSlots', JSON.stringify(updatedSlots));
        return true;
    };

    /**
     * Remove vehicle from parking slot.
     */
    const leaveParking = (slotId) => {
        const slot = parkingSlots.find(s => s.id === slotId);
        if (slot && slot.status === 'occupied') {
            showInfo(`Vehicle ${slot.plateNumber} left parking successfully.`);
            const updatedSlots = parkingSlots.map(s =>
                s.id === slotId ? { ...s, status: 'available', plateNumber: '', stickerId: '', entryTime: null } : s
            );
            setParkingSlots(updatedSlots);
            localStorage.setItem('parkingSlots', JSON.stringify(updatedSlots));
        }
    };

    /**
     * Handle parking vehicle from table slot button.
     */
    const handleTableParkVehicle = (slotId) => {
        if (!parkStickerInput.trim()) {
            showError('Please enter a sticker ID first');
            return;
        }
        
        const sticker = parkStickerInput.trim().toUpperCase();
        const validStickers = getValidStickers();
        if (validStickers.includes(sticker)) {
            const plateNumber = getPlateFromSticker(sticker);
            if (plateNumber) {
                parkVehicle(slotId, plateNumber, sticker);
                setParkStickerInput('');
            } else {
                showError('Could not find plate number for this sticker ID');
            }
        } else {
            showError(`Invalid sticker ID. Valid approved stickers: ${validStickers.join(', ')}`);
        }
    };

    // Calculate statistics
    const pendingCount = records.filter(r => r.status === 'Pending').length;
    const approvedCount = records.filter(r => r.status === 'Approved').length;
    const totalRevenue = records.filter(r => r.status === 'Approved')
                                .reduce((acc, curr) => acc + getFee(curr.vehicle_type), 0);

    return (
        <div className="center">
            <div className="card admin-large-card">
                
                {/* TOPBAR */}
                <div className="topbar" style={{ marginBottom: '20px' }}>
                    <div>
                        <h2>UA Admin Management</h2>
                        <p className="subtitle">IT3B Finals • System Overview</p>
                    </div>
                    <div className="topbar-actions" style={{ gap: '20px' }}>
                        <button className="btn-purple slim" onClick={fetchData}>Refresh System</button>
                        <button className="btn-blue slim" onClick={() => navigate('/')}>Logout</button>
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
                        Parking Management
                    </button>
                </div>

                {activeTab === 'applications' && (
                <>

                {/* QUICK VERIFY */}
                <div className="panel" style={{ textAlign: 'center', padding: '20px' }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>Quick Verify Sticker</h3>
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                        <input 
                            type="text" 
                            placeholder="Enter Sticker ID (e.g. UA-001)" 
                            value={verifyInput}
                            style={{ textAlign: 'center', fontSize: '1.1rem', padding: '12px' }}
                            onChange={(e) => setVerifyInput(e.target.value)}
                            onKeyDown={handleVerifyKeyPress}
                        />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
                            <button className="btn-blue" onClick={handleVerify} style={{ width: '200px' }}>Verify Now</button>
                            {activeVerify && <button className="btn-gray" onClick={clearVerify} style={{ width: '100px' }}>Clear</button>}
                        </div>
                    </div>
                </div>

                {/* STATS ROW */}
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
                    <div className="stat-card"><h3>TOTAL APPS</h3><p>{records.length}</p></div>
                    <div className="stat-card" style={{ borderTop: '4px solid #ea580c' }}><h3 style={{color:'#ea580c'}}>PENDING</h3><p style={{color:'#ea580c'}}>{pendingCount}</p></div>
                    <div className="stat-card" style={{ borderTop: '4px solid #16a34a' }}><h3 style={{color:'#16a34a'}}>APPROVED</h3><p style={{color:'#16a34a'}}>{approvedCount}</p></div>
                    <div className="stat-card" style={{ borderTop: '4px solid #2563eb' }}><h3>REVENUE</h3><p>₱{totalRevenue.toLocaleString()}</p></div>
                </div>

                {/* TABLE PANEL */}
                <div className="panel">
                    <div className="panel-header-with-filter">
                        <h3 style={{ margin: 0 }}>Application Records</h3>
                        <div className="filter-controls">
                            <button className={isDecrypted ? "btn-green slim" : "btn-gray slim"} onClick={() => setIsDecrypted(!isDecrypted)}>
                                {isDecrypted ? 'Hide Data' : 'Decrypt Data'}
                            </button>
                            <input type="text" className="table-filter" placeholder="Search Plate..." onChange={(e) => setSearch(e.target.value.toLowerCase())} onKeyDown={handleSearchKeyPress} />
                        </div>
                    </div>

                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Owner Name</th>
                                    <th>Role & Details</th>
                                    <th>Plate Number</th>
                                    <th>Sticker ID</th>
                                    <th>Type</th>
                                    <th>Fee</th>
                                    <th>Expires</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records
                                    .filter(r => {
                                        if (activeVerify) return r.sticker_id === activeVerify;
                                        return decryptData(r.plate_number).toLowerCase().includes(search);
                                    })
                                    .slice().reverse().map((v) => (
                                    <tr key={v.id}>
                                        <td style={{ fontWeight: 600 }}>{isDecrypted ? decryptData(v.owner_name) : v.owner_name}</td>
                                        
                                        {/* ROLE INFO COLUMN */}
                                        <td>
                                            <div style={{ lineHeight: '1.2' }}>
                                                <strong style={{ 
                                                    display: 'block', 
                                                    fontSize: '0.75rem', 
                                                    color: v.role?.toLowerCase() === 'guest' ? '#2563eb' : '#ea580c',
                                                    textTransform: 'uppercase' 
                                                }}>
                                                    {v.role || 'USER'}
                                                </strong>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    {v.identifier || 'N/A'}
                                                </span>
                                            </div>
                                        </td>

                                        <td className="bold-plate">{isDecrypted ? decryptData(v.plate_number) : v.plate_number}</td>
                                        <td className="sticker-id-text">{v.sticker_id || '---'}</td>
                                        <td>{v.vehicle_type}</td>
                                        <td>₱{getFee(v.vehicle_type).toLocaleString()}</td>
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
                                        <td>
                                            <span className={`status-badge ${v.status.toLowerCase()}`}>
                                                {v.status}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {v.status === 'Pending' ? (
                                                <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                                    <button className="btn-green slim" onClick={() => handleUpdateStatus(v.id, 'Approved')}>✔</button>
                                                    <button className="btn-red slim" onClick={() => handleUpdateStatus(v.id, 'Rejected')}>✖</button>
                                                </div>
                                            ) : <button className="btn-gray slim" onClick={() => handleUpdateStatus(v.id, 'Pending')}>Reset</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                </>)}

                {activeTab === 'parking' && (
                <>

                {/* PARKING MANAGEMENT */}
                <div className="panel" style={{ marginBottom: '20px' }}>
                    <h3>Sticker Management</h3>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <input 
                            type="text" 
                            placeholder="Check Sticker ID" 
                            value={newSticker} 
                            onChange={(e) => setNewSticker(e.target.value)}
                            onKeyDown={handleStickerCheckKeyPress}
                        />
                        <button className="btn-blue" onClick={addSticker}>Check Sticker</button>
                    </div>
                    <div>
                        <strong>Valid Stickers from Approved Applications:</strong> {getValidStickers().join(', ')}
                        <p style={{ fontSize: '0.9em', color: '#666', marginTop: '5px' }}>
                            Parking access is automatically granted to approved application sticker IDs that haven't expired.
                            Stickers are valid for 1 academic year from approval date.
                        </p>
                        {records.filter(r => r.status === 'Approved' && r.expiration_date && new Date(r.expiration_date) < new Date()).length > 0 && (
                            <p style={{ fontSize: '0.9em', color: '#dc2626', marginTop: '5px' }}>
                                ⚠️ Expired stickers: {records.filter(r => r.status === 'Approved' && r.expiration_date && new Date(r.expiration_date) < new Date()).map(r => r.sticker_id).join(', ')}
                            </p>
                        )}
                    </div>
                </div>

                <div className="panel">
                    <h3>Parking Slots</h3>
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Slot</th>
                                    <th>Status</th>
                                    <th>Plate Number</th>
                                    <th>Sticker ID</th>
                                    <th>Entry Time</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parkingSlots.map(slot => (
                                    <tr key={slot.id}>
                                        <td>{slot.id}</td>
                                        <td>
                                            <span className={`status-badge ${slot.status === 'available' ? 'approved' : 'pending'}`}>
                                                {slot.status}
                                            </span>
                                        </td>
                                        <td>{slot.plateNumber || '-'}</td>
                                        <td>{slot.stickerId || '-'}</td>
                                        <td>{slot.entryTime ? new Date(slot.entryTime).toLocaleString() : '-'}</td>
                                        <td>
                                            {slot.status === 'available' ? (
                                                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Sticker ID"
                                                        value={parkStickerInput}
                                                        onChange={(e) => setParkStickerInput(e.target.value)}
                                                        style={{ width: '80px', fontSize: '12px', padding: '4px' }}
                                                    />
                                                    <button 
                                                        className="btn-blue slim" 
                                                        onClick={() => handleTableParkVehicle(slot.id)}
                                                        style={{ fontSize: '12px', padding: '4px 8px' }}
                                                    >
                                                        Park
                                                    </button>
                                                </div>
                                            ) : (
                                                <button className="btn-red slim" onClick={() => leaveParking(slot.id)}>Leave</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                </>)}

            </div>
        </div>
    );
}