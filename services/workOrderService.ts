import { loggingService } from './loggingService';

export interface WorkOrder {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'active' | 'completed' | 'rejected' | 'unresolved';
    createdAt: number;
    updatedAt: number;
    stage?: string;
    errorMessage?: string;
    rejectionReason?: string;
    progress?: number;
    originalRequestId?: string;
    reframedAttempts?: number;
}

class WorkOrderService {
    private workOrders: Map<string, WorkOrder> = new Map();

    /**
     * Create a new work order from extracted command
     */
    createWorkOrder(
        title: string,
        description: string,
        stage?: string
    ): WorkOrder {
        const id = `wo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const order: WorkOrder = {
            id,
            title,
            description,
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            stage,
        };
        this.workOrders.set(id, order);
        loggingService.log('INFO', `[WORK ORDER] Created: ${id}`, { title, stage });
        return order;
    }

    /**
     * Mark order as active
     */
    setActive(orderId: string, progress: number = 0): WorkOrder | null {
        const order = this.workOrders.get(orderId);
        if (!order) return null;
        order.status = 'active';
        order.progress = progress;
        order.updatedAt = Date.now();
        loggingService.log('INFO', `[WORK ORDER] Active: ${orderId}`);
        return order;
    }

    /**
     * Mark order as completed
     */
    setCompleted(orderId: string): WorkOrder | null {
        const order = this.workOrders.get(orderId);
        if (!order) return null;
        order.status = 'completed';
        order.progress = 100;
        order.updatedAt = Date.now();
        loggingService.log('INFO', `[WORK ORDER] Completed: ${orderId}`);
        return order;
    }

    /**
     * Ralph rejects a work order with a reason
     * Route back to L2 for reframing
     */
    setRejected(orderId: string, rejectionReason: string): WorkOrder | null {
        const order = this.workOrders.get(orderId);
        if (!order) return null;
        order.status = 'rejected';
        order.rejectionReason = rejectionReason;
        order.updatedAt = Date.now();
        loggingService.log('INFO', `[WORK ORDER] Rejected: ${orderId}`, { reason: rejectionReason });
        return order;
    }

    /**
     * L2 reframes a rejected order
     * Creates new order linking to original
     */
    reframeOrder(originalId: string, newTitle: string, newDescription: string): WorkOrder | null {
        const original = this.workOrders.get(originalId);
        if (!original) return null;

        const newOrder = this.createWorkOrder(newTitle, newDescription, original.stage);
        newOrder.originalRequestId = originalId;

        // Track reframe count on original
        if (!original.reframedAttempts) original.reframedAttempts = 0;
        original.reframedAttempts++;

        loggingService.log('INFO', `[WORK ORDER] Reframed: ${originalId} → ${newOrder.id}`);
        return newOrder;
    }

    /**
     * Mark as unresolved when L2 exhausts reframing attempts
     * This becomes system anomaly visible to L1
     */
    setUnresolved(orderId: string, errorMessage: string): WorkOrder | null {
        const order = this.workOrders.get(orderId);
        if (!order) return null;
        order.status = 'unresolved';
        order.errorMessage = errorMessage;
        order.updatedAt = Date.now();
        loggingService.log('INFO', `[WORK ORDER] Unresolved: ${orderId}`, { error: errorMessage });
        return order;
    }

    /**
     * Get all active and unresolved orders (for L1 anomaly detection)
     */
    getAnomalies(): WorkOrder[] {
        return Array.from(this.workOrders.values()).filter(
            order => order.status === 'rejected' || order.status === 'unresolved'
        );
    }

    /**
     * Get all work orders
     */
    getAll(): WorkOrder[] {
        return Array.from(this.workOrders.values());
    }

    /**
     * Get order by ID
     */
    get(orderId: string): WorkOrder | null {
        return this.workOrders.get(orderId) || null;
    }

    /**
     * Clear all work orders (session reset)
     */
    clear(): void {
        this.workOrders.clear();
        loggingService.log('INFO', '[WORK ORDER] Cleared all orders');
    }
}

export const workOrderService = new WorkOrderService();
