/**
 * Telemetry Service - Direct Database Implementation
 * Safe implementation with feature flag control
 */

import type { TelemetryEvent, TelemetryCapture, TelemetryConfig } from '../types/telemetry.js';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { TelemetryError } from '../types/telemetry.js';

export class McpTelemetryService implements TelemetryCapture {
  private config: TelemetryConfig;
  private sql?: NeonQueryFunction<false, false>;
  
  constructor(config: TelemetryConfig = { enabled: false }, sql?: NeonQueryFunction<false, false>) {
    this.config = config;
    this.sql = sql;
    
    // Silent initialization for internal tracking
  }
  
  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  async capture(event: TelemetryEvent): Promise<void> {
    if (!this.isEnabled()) {
      return; // No-op when disabled
    }
    
    if (!this.sql) {
      // No database connection for internal tracking
      return;
    }
    
    try {
      await this.sql`
        INSERT INTO mcp_tool_telemetry (
          request_id, tool_name, input_params, user_id, username, auth_provider,
          timestamp, execution_time_ms, user_agent, metadata
        ) VALUES (
          ${event.requestId},
          ${event.toolName},
          ${JSON.stringify(event.inputParams)},
          ${event.userId},
          ${event.username},
          ${event.authProvider},
          ${event.timestamp.toISOString()},
          ${event.executionTimeMs || null},
          ${event.userAgent || null},
          ${event.metadata ? JSON.stringify(event.metadata) : null}
        )
      `;
      
      // Event captured silently
    } catch (error) {
      // Silent error handling - telemetry failures don't affect user experience
      // Don't throw - telemetry failures shouldn't break the main flow
    }
  }
  
  async captureBatch(events: TelemetryEvent[]): Promise<void> {
    if (!this.isEnabled() || events.length === 0) {
      return;
    }
    
    if (!this.sql) {
      // No database connection for batch tracking
      return;
    }
    
    // For now, just capture individually
    // TODO: Implement true batch insert for better performance
    for (const event of events) {
      await this.capture(event);
    }
    
    // Batch captured silently
  }
  
  // Utility method to generate request ID
  static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global instance - will be disabled by default
export const telemetryService = new McpTelemetryService({
  enabled: false // Safe: disabled by default
});

// Environment-based configuration
export function configureTelemetry(env: Record<string, any>): McpTelemetryService {
  const enabled = env.TELEMETRY_ENABLED === 'true';
  
  return new McpTelemetryService({
    enabled,
    batchSize: parseInt(env.TELEMETRY_BATCH_SIZE || '10'),
    flushInterval: parseInt(env.TELEMETRY_FLUSH_INTERVAL || '30000'), // 30 seconds
    maxRetries: parseInt(env.TELEMETRY_MAX_RETRIES || '3')
  });
}