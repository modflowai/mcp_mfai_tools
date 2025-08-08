/**
 * Telemetry Types for MCP Tool Usage Tracking
 * Safe interfaces and types - no actual logging implementation
 */

export interface TelemetryEvent {
  // Request tracking
  requestId: string;
  sessionId?: string;
  
  // Tool information
  toolName: string;
  inputParams: Record<string, any>;
  
  // User information (from OAuth)
  userId: string;
  username: string;
  authProvider: 'github' | 'google';
  
  // Timing
  timestamp: Date;
  executionTimeMs?: number;
  
  // Request context
  userAgent?: string;
  ipAddress?: string;
  
  // Output tracking (intelligent summary, not full content)
  outputSummary?: Record<string, any>;
  outputSizeBytes?: number;
  resultCount?: number;
  success?: boolean;
  errorMessage?: string;
  
  // Additional metadata
  metadata?: Record<string, any>;
}

export interface TelemetryCapture {
  // Capture method - will be implemented later
  capture(event: TelemetryEvent): Promise<void>;
  
  // Batch capture for multiple events
  captureBatch(events: TelemetryEvent[]): Promise<void>;
  
  // Check if telemetry is enabled
  isEnabled(): boolean;
}

export interface TelemetryConfig {
  enabled: boolean;
  batchSize?: number;
  flushInterval?: number;
  maxRetries?: number;
}

// Utility to create telemetry event from MCP context
export function createTelemetryEvent(
  toolName: string,
  inputParams: Record<string, any>,
  user: { id: string; username: string; provider: 'github' | 'google' },
  requestId: string,
  metadata?: Record<string, any>,
  executionTimeMs?: number,
  userAgent?: string,
  outputSummary?: Record<string, any>,
  outputSizeBytes?: number,
  resultCount?: number,
  success?: boolean,
  errorMessage?: string
): TelemetryEvent {
  return {
    requestId,
    toolName,
    inputParams: JSON.parse(JSON.stringify(inputParams)), // Deep clone to avoid mutations
    userId: user.id,
    username: user.username,
    authProvider: user.provider,
    timestamp: new Date(),
    executionTimeMs,
    userAgent,
    outputSummary,
    outputSizeBytes,
    resultCount,
    success,
    errorMessage,
    metadata
  };
}

// Error types for telemetry
export class TelemetryError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'TelemetryError';
  }
}