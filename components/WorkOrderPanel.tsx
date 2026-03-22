import React, { useState, useEffect } from 'react';
import { CheckIcon, CloseIcon, ClockIcon } from './icons/index';

interface WorkOrder {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'active' | 'completed' | 'rejected' | 'unresolved';
    createdAt: number;
    updatedAt: number;
    stage?: string; // Which cognitive stage or agent is handling this
    errorMessage?: string;
    rejectionReason?: string; // Why Ralph rejected this order
    progress?: number; // 0-100
    originalRequestId?: string; // If this is a reframed order, link to original
    reframedAttempts?: number; // How many times L2 has reframed this
}

interface WorkOrderPanelProps {
    workOrders: WorkOrder[];
}

export const WorkOrderPanel: React.FC<WorkOrderPanelProps> = ({ workOrders }) => {
    const [sortByStatus, setSortByStatus] = useState<'all' | 'active' | 'completed'>('all');

    const filteredOrders = workOrders.filter(order => {
        if (sortByStatus === 'active') return order.status === 'pending' || order.status === 'active' || order.status === 'rejected' || order.status === 'unresolved';
        if (sortByStatus === 'completed') return order.status === 'completed';
        return true;
    });

    const getStatusColor = (status: WorkOrder['status']): string => {
        switch (status) {
            case 'pending': return 'text-yellow-400 border-yellow-500/50';
            case 'active': return 'text-cyan-400 border-cyan-500/50';
            case 'completed': return 'text-green-400 border-green-500/50';
            case 'rejected': return 'text-red-400 border-red-500/50';
            case 'unresolved': return 'text-orange-400 border-orange-500/50';
            default: return 'text-gray-400 border-gray-500/50';
        }
    };

    const getStatusLabel = (status: WorkOrder['status']): string => {
        switch (status) {
            case 'pending': return 'Pending';
            case 'active': return 'Active';
            case 'completed': return 'Completed';
            case 'rejected': return 'Rejected';
            case 'unresolved': return 'Unresolved';
            default: return 'Unknown';
        }
    };

    const getStatusIcon = (status: WorkOrder['status']): React.ReactNode => {
        switch (status) {
            case 'pending': return <ClockIcon />;
            case 'active': return <div className="w-3 h-3 rounded-full border border-cyan-400 animate-spin" />;
            case 'completed': return <CheckIcon />;
            case 'rejected': return <CloseIcon />;
            case 'unresolved': return <div className="w-3 h-3 rounded-full border border-orange-400" />;
            default: return null;
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-900/20 p-4 min-w-0">
            <div className="flex items-center justify-between mb-4 min-w-0">
                <h3 className="text-xs font-bold text-cyan-700 flex items-center gap-2 truncate">
                    <ClockIcon />
                    WORK_ORDERS
                </h3>
                <div className="flex gap-1 flex-shrink-0">
                    <button
                        onClick={() => setSortByStatus('all')}
                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                            sortByStatus === 'all'
                                ? 'bg-cyan-700 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setSortByStatus('active')}
                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                            sortByStatus === 'active'
                                ? 'bg-cyan-700 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                    >
                        Active
                    </button>
                    <button
                        onClick={() => setSortByStatus('completed')}
                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                            sortByStatus === 'completed'
                                ? 'bg-cyan-700 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                    >
                        Done
                    </button>
                </div>
            </div>

            {filteredOrders.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-8 italic">
                    {sortByStatus === 'all' ? 'No work orders.' : 'No matching work orders.'}
                </div>
            ) : (
                <div className="space-y-3 overflow-y-auto flex-1">
                    {filteredOrders.map(order => (
                        <div
                            key={order.id}
                            className={`border-l-2 pl-2 py-2 text-xs space-y-1 border-opacity-50 ${getStatusColor(
                                order.status
                            )}`}
                        >
                            <div className="flex items-center gap-2">
                                {getStatusIcon(order.status)}
                                <span className="font-semibold flex-1 truncate">{order.title}</span>
                                <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                                    {getStatusLabel(order.status)}
                                </span>
                            </div>
                            {order.description && (
                                <p className="text-gray-400 truncate">{order.description}</p>
                            )}
                            {order.stage && (
                                <p className="text-gray-500 text-[10px]">
                                    Stage: <span className="text-gray-400">{order.stage}</span>
                                </p>
                            )}
                            {order.progress !== undefined && order.status === 'active' && (
                                <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                                    <div
                                        className="bg-cyan-500 h-1.5 rounded-full transition-all"
                                        style={{ width: `${order.progress}%` }}
                                    />
                                </div>
                            )}
                            {order.rejectionReason && order.status === 'rejected' && (
                                <p className="text-red-400 text-[10px] italic truncate">
                                    Rejected: {order.rejectionReason}
                                </p>
                            )}
                            {order.errorMessage && order.status === 'unresolved' && (
                                <p className="text-orange-400 text-[10px] italic truncate">
                                    Issue: {order.errorMessage}
                                </p>
                            )}
                            {order.reframedAttempts && order.reframedAttempts > 0 && (
                                <p className="text-gray-500 text-[10px]">
                                    Reframed <span className="text-gray-400">{order.reframedAttempts}</span>x
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
