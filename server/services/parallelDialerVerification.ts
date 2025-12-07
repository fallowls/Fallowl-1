import { storage } from "../storage";
import type { Call } from "@shared/schema";

/**
 * Parallel Dialer Verification Service
 * Provides comprehensive validation, monitoring, and analytics for the parallel dialer workflow
 */

export interface VerificationReport {
  timestamp: string;
  userId: number;
  testType: string;
  passed: boolean;
  details: any;
  issues: string[];
  recommendations: string[];
}

export interface DataIntegrityCheck {
  callId: number;
  callSid: string;
  hasConnectionTime: boolean;
  hasRingDuration: boolean;
  hasAMDResult: boolean;
  hasDisposition: boolean;
  hasMetadata: boolean;
  isValid: boolean;
  missingFields: string[];
}

export interface AMDPerformanceMetrics {
  totalCalls: number;
  humanDetections: number;
  machineDetections: number;
  unknownResults: number;
  avgDetectionTime: number;
  detectionAccuracy: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface DispositionAccuracy {
  totalCalls: number;
  dispositionBreakdown: Record<string, number>;
  missingDispositions: number;
  inconsistentDispositions: number;
  accuracyRate: number;
}

export interface ResourceLeakCheck {
  activeCallsCount: number;
  stuckCalls: Call[];
  ghostCalls: Call[];
  orphanedConferences: any[];
  cleanupRequired: boolean;
}

export interface SingleCallEnforcementReport {
  testTime: string;
  primaryCallSid: string;
  secondaryCallsCount: number;
  secondaryCallsDropped: number;
  dropLatency: number[];
  avgDropLatency: number;
  enforcementSuccess: boolean;
  issues: string[];
}

export class ParallelDialerVerificationService {
  /**
   * Verify data integrity for parallel dialer calls
   */
  async verifyDataIntegrity(userId: number, startDate?: Date, endDate?: Date): Promise<VerificationReport> {
    const issues: string[] = [];
    const checks: DataIntegrityCheck[] = [];

    try {
      // Get all parallel dialer calls in the date range
      const calls = await this.getParallelDialerCalls(userId, startDate, endDate);

      for (const call of calls) {
        const check: DataIntegrityCheck = {
          callId: call.id,
          callSid: call.sipCallId || 'unknown',
          hasConnectionTime: !!call.connectionTime,
          hasRingDuration: call.ringDuration !== null && call.ringDuration !== undefined,
          hasAMDResult: !!call.answeredBy,
          hasDisposition: !!call.disposition,
          hasMetadata: !!call.metadata,
          isValid: true,
          missingFields: []
        };

        // Check for missing critical fields
        if (!check.hasConnectionTime && call.status === 'completed') {
          check.missingFields.push('connectionTime');
          check.isValid = false;
        }

        if (!check.hasRingDuration && ['completed', 'canceled'].includes(call.status)) {
          check.missingFields.push('ringDuration');
          check.isValid = false;
        }

        if (!check.hasAMDResult && call.status === 'completed') {
          check.missingFields.push('answeredBy');
          check.isValid = false;
        }

        if (!check.hasDisposition) {
          check.missingFields.push('disposition');
          check.isValid = false;
        }

        if (!check.isValid) {
          issues.push(`Call ${call.id} (${check.callSid}) missing fields: ${check.missingFields.join(', ')}`);
        }

        checks.push(check);
      }

      const validCalls = checks.filter(c => c.isValid).length;
      const totalCalls = checks.length;
      const integrityRate = totalCalls > 0 ? (validCalls / totalCalls) * 100 : 100;

      return {
        timestamp: new Date().toISOString(),
        userId,
        testType: 'data_integrity',
        passed: integrityRate >= 95,
        details: {
          totalCalls,
          validCalls,
          invalidCalls: totalCalls - validCalls,
          integrityRate: integrityRate.toFixed(2) + '%',
          checks: checks.slice(0, 10) // Sample for review
        },
        issues,
        recommendations: this.generateIntegrityRecommendations(checks)
      };
    } catch (error: any) {
      return {
        timestamp: new Date().toISOString(),
        userId,
        testType: 'data_integrity',
        passed: false,
        details: { error: error.message },
        issues: [`Verification failed: ${error.message}`],
        recommendations: ['Review database connectivity and schema integrity']
      };
    }
  }

  /**
   * Analyze AMD (Answering Machine Detection) performance
   */
  async analyzeAMDPerformance(userId: number, startDate?: Date, endDate?: Date): Promise<AMDPerformanceMetrics> {
    const calls = await this.getParallelDialerCalls(userId, startDate, endDate);

    let humanDetections = 0;
    let machineDetections = 0;
    let unknownResults = 0;
    let totalDetectionTime = 0;
    let detectionTimeCount = 0;

    for (const call of calls) {
      const answeredBy = call.answeredBy?.toLowerCase();

      if (answeredBy === 'human') {
        humanDetections++;
      } else if (answeredBy?.startsWith('machine') || answeredBy === 'fax') {
        machineDetections++;
      } else {
        unknownResults++;
      }

      // Calculate detection time from metadata if available
      const metadata = call.metadata as any;
      if (metadata?.machineDetectionDuration) {
        totalDetectionTime += metadata.machineDetectionDuration;
        detectionTimeCount++;
      }
    }

    const totalCalls = calls.length;
    const avgDetectionTime = detectionTimeCount > 0 ? totalDetectionTime / detectionTimeCount : 0;
    const detectionAccuracy = totalCalls > 0 
      ? ((humanDetections + machineDetections) / totalCalls) * 100 
      : 100;

    return {
      totalCalls,
      humanDetections,
      machineDetections,
      unknownResults,
      avgDetectionTime,
      detectionAccuracy,
      falsePositives: 0, // Would need manual verification data to calculate
      falseNegatives: 0  // Would need manual verification data to calculate
    };
  }

  /**
   * Validate disposition accuracy across different call scenarios
   */
  async validateDispositionAccuracy(userId: number, startDate?: Date, endDate?: Date): Promise<DispositionAccuracy> {
    const calls = await this.getParallelDialerCalls(userId, startDate, endDate);

    const dispositionBreakdown: Record<string, number> = {};
    let missingDispositions = 0;
    let inconsistentDispositions = 0;

    for (const call of calls) {
      if (!call.disposition) {
        missingDispositions++;
        continue;
      }

      // Count dispositions
      dispositionBreakdown[call.disposition] = (dispositionBreakdown[call.disposition] || 0) + 1;

      // Check for inconsistencies
      if (call.status === 'completed' && call.disposition === 'failed') {
        inconsistentDispositions++;
      }

      if (call.answeredBy === 'machine' && call.disposition === 'connected') {
        inconsistentDispositions++;
      }

      if (call.answeredBy === 'human' && call.disposition === 'voicemail') {
        inconsistentDispositions++;
      }
    }

    const totalCalls = calls.length;
    const validDispositions = totalCalls - missingDispositions - inconsistentDispositions;
    const accuracyRate = totalCalls > 0 ? (validDispositions / totalCalls) * 100 : 100;

    return {
      totalCalls,
      dispositionBreakdown,
      missingDispositions,
      inconsistentDispositions,
      accuracyRate
    };
  }

  /**
   * Check for resource leaks and ghost calls
   */
  async checkResourceLeaks(userId: number, tenantId?: number): Promise<ResourceLeakCheck> {
    const effectiveTenantId = tenantId || userId;
    const activeCalls = await storage.getActiveCalls(effectiveTenantId, userId);
    const stuckCalls: Call[] = [];
    const ghostCalls: Call[] = [];

    const now = Date.now();
    const thirtyMinutesAgo = now - (30 * 60 * 1000);

    for (const call of activeCalls) {
      const createdAt = call.createdAt ? new Date(call.createdAt).getTime() : now;

      // Stuck calls: active for more than 30 minutes
      if (createdAt < thirtyMinutesAgo) {
        if (['initiated', 'queued', 'ringing'].includes(call.status)) {
          stuckCalls.push(call);
        } else if (['in-progress', 'answered'].includes(call.status)) {
          // In-progress for > 30 min might be legitimate long calls
          // Only flag if > 2 hours
          if (createdAt < (now - (2 * 60 * 60 * 1000))) {
            stuckCalls.push(call);
          }
        }
      }

      // Ghost calls: marked active but should be completed
      if (call.duration && call.duration > 0 && call.status !== 'completed') {
        ghostCalls.push(call);
      }
    }

    return {
      activeCallsCount: activeCalls.length,
      stuckCalls,
      ghostCalls,
      orphanedConferences: [], // Would need Twilio API to check
      cleanupRequired: stuckCalls.length > 0 || ghostCalls.length > 0
    };
  }

  /**
   * Test single-call enforcement mechanism
   */
  async verifySingleCallEnforcement(userId: number, timeWindow: number = 300): Promise<SingleCallEnforcementReport> {
    // Get recent parallel dialer calls within the time window (in seconds)
    const startDate = new Date(Date.now() - (timeWindow * 1000));
    const calls = await this.getParallelDialerCalls(userId, startDate);

    const issues: string[] = [];
    const dropLatencies: number[] = [];

    // Group calls by session (calls initiated within same 10-second window)
    const sessions = this.groupCallsBySession(calls);

    let totalSecondaryCalls = 0;
    let totalDropped = 0;

    for (const session of sessions) {
      const connectedCalls = session.filter(c => 
        c.status === 'completed' && c.answeredBy === 'human'
      );

      const droppedCalls = session.filter(c => 
        c.status === 'canceled' && (c.metadata as any)?.cancelReason === 'human_answered_on_another_line'
      );

      if (connectedCalls.length > 1) {
        issues.push(`Multiple connected calls in same session: ${connectedCalls.map(c => c.sipCallId).join(', ')}`);
      }

      if (connectedCalls.length === 1) {
        totalSecondaryCalls += session.length - 1;
        totalDropped += droppedCalls.length;

        // Calculate drop latency
        const primaryCall = connectedCalls[0];
        const primaryConnectTime = primaryCall.connectionTime?.getTime() || 0;

        for (const dropped of droppedCalls) {
          const metadata = dropped.metadata as any;
          if (metadata?.canceledAt) {
            const dropTime = new Date(metadata.canceledAt).getTime();
            const latency = dropTime - primaryConnectTime;
            if (latency >= 0) {
              dropLatencies.push(latency);
            }
          }
        }
      }
    }

    const avgDropLatency = dropLatencies.length > 0
      ? dropLatencies.reduce((a, b) => a + b, 0) / dropLatencies.length
      : 0;

    const enforcementSuccess = totalSecondaryCalls === 0 || 
      (totalDropped / Math.max(totalSecondaryCalls, 1)) >= 0.95;

    return {
      testTime: new Date().toISOString(),
      primaryCallSid: calls[0]?.sipCallId || 'none',
      secondaryCallsCount: totalSecondaryCalls,
      secondaryCallsDropped: totalDropped,
      dropLatency: dropLatencies,
      avgDropLatency,
      enforcementSuccess,
      issues
    };
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateAnalyticsReport(userId: number, startDate?: Date, endDate?: Date) {
    const [
      integrityReport,
      amdMetrics,
      dispositionReport,
      resourceLeaks,
      enforcementReport
    ] = await Promise.all([
      this.verifyDataIntegrity(userId, startDate, endDate),
      this.analyzeAMDPerformance(userId, startDate, endDate),
      this.validateDispositionAccuracy(userId, startDate, endDate),
      this.checkResourceLeaks(userId),
      this.verifySingleCallEnforcement(userId)
    ]);

    const calls = await this.getParallelDialerCalls(userId, startDate, endDate);
    
    return {
      summary: {
        totalCalls: calls.length,
        dateRange: {
          start: startDate?.toISOString() || 'all time',
          end: endDate?.toISOString() || 'now'
        },
        overallHealth: this.calculateOverallHealth([
          integrityReport,
          { passed: amdMetrics.detectionAccuracy >= 80 },
          { passed: dispositionReport.accuracyRate >= 90 },
          { passed: !resourceLeaks.cleanupRequired },
          { passed: enforcementReport.enforcementSuccess }
        ])
      },
      dataIntegrity: integrityReport,
      amdPerformance: amdMetrics,
      dispositionAccuracy: dispositionReport,
      resourceLeaks,
      singleCallEnforcement: enforcementReport,
      recommendations: this.generateOverallRecommendations([
        integrityReport,
        amdMetrics,
        dispositionReport,
        resourceLeaks,
        enforcementReport
      ])
    };
  }

  /**
   * Helper: Get parallel dialer calls
   */
  private async getParallelDialerCalls(userId: number, startDate?: Date, endDate?: Date, tenantId?: number): Promise<Call[]> {
    const effectiveTenantId = tenantId || userId;
    const allCalls = await storage.getAllCalls(effectiveTenantId, userId);
    
    return allCalls.filter((call: Call) => {
      const metadata = call.metadata as any;
      const isParallelDialer = call.isParallelDialer || metadata?.lineId;
      
      if (!isParallelDialer) return false;

      if (startDate && call.createdAt && new Date(call.createdAt) < startDate) return false;
      if (endDate && call.createdAt && new Date(call.createdAt) > endDate) return false;

      return true;
    });
  }

  /**
   * Helper: Group calls by session
   */
  private groupCallsBySession(calls: Call[]): Call[][] {
    const sessions: Call[][] = [];
    const sortedCalls = [...calls].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    let currentSession: Call[] = [];
    let lastCallTime = 0;

    for (const call of sortedCalls) {
      const callTime = call.createdAt ? new Date(call.createdAt).getTime() : 0;

      if (currentSession.length === 0 || (callTime - lastCallTime) <= 10000) {
        currentSession.push(call);
      } else {
        if (currentSession.length > 0) {
          sessions.push(currentSession);
        }
        currentSession = [call];
      }

      lastCallTime = callTime;
    }

    if (currentSession.length > 0) {
      sessions.push(currentSession);
    }

    return sessions;
  }

  /**
   * Helper: Generate integrity recommendations
   */
  private generateIntegrityRecommendations(checks: DataIntegrityCheck[]): string[] {
    const recommendations: string[] = [];
    const invalidChecks = checks.filter(c => !c.isValid);

    if (invalidChecks.length === 0) return ['Data integrity is excellent. No action required.'];

    const missingFields = new Set<string>();
    invalidChecks.forEach(check => {
      check.missingFields.forEach(field => missingFields.add(field));
    });

    if (missingFields.has('connectionTime')) {
      recommendations.push('Ensure Twilio webhooks are properly configured to capture connection timestamps');
    }

    if (missingFields.has('ringDuration')) {
      recommendations.push('Verify ring duration calculation logic in call status callbacks');
    }

    if (missingFields.has('answeredBy')) {
      recommendations.push('Check AMD configuration - ensure MachineDetection is enabled on outbound calls');
    }

    if (missingFields.has('disposition')) {
      recommendations.push('Review disposition assignment logic in webhook handlers');
    }

    return recommendations;
  }

  /**
   * Helper: Calculate overall health score
   */
  private calculateOverallHealth(reports: Array<{ passed: boolean }>): string {
    const passCount = reports.filter(r => r.passed).length;
    const total = reports.length;
    const percentage = (passCount / total) * 100;

    if (percentage >= 90) return 'Excellent';
    if (percentage >= 75) return 'Good';
    if (percentage >= 60) return 'Fair';
    return 'Needs Attention';
  }

  /**
   * Helper: Generate overall recommendations
   */
  private generateOverallRecommendations(reports: any[]): string[] {
    const recommendations: string[] = [];

    if (reports[0] && !reports[0].passed) {
      recommendations.push('Address data integrity issues to ensure accurate reporting');
    }

    if (reports[1] && reports[1].detectionAccuracy < 80) {
      recommendations.push('Consider adjusting AMD sensitivity settings to improve detection accuracy');
    }

    if (reports[2] && reports[2].accuracyRate < 90) {
      recommendations.push('Review and refine disposition mapping logic for better accuracy');
    }

    if (reports[3] && reports[3].cleanupRequired) {
      recommendations.push('Run resource cleanup to remove stuck or ghost calls');
    }

    if (reports[4] && !reports[4].enforcementSuccess) {
      recommendations.push('Investigate single-call enforcement failures - ensure proper call termination');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is operating optimally. Continue monitoring for best performance.');
    }

    return recommendations;
  }

  /**
   * Cleanup stuck or ghost calls
   */
  async cleanupStaleCalls(userId: number, tenantId?: number): Promise<{ cleaned: number; errors: string[] }> {
    const effectiveTenantId = tenantId || userId;
    const leakCheck = await this.checkResourceLeaks(userId, effectiveTenantId);
    const errors: string[] = [];
    let cleaned = 0;

    for (const call of [...leakCheck.stuckCalls, ...leakCheck.ghostCalls]) {
      try {
        await storage.updateCall(effectiveTenantId, userId, call.id, {
          status: 'failed',
          hangupReason: 'cleanup_stale_call',
          metadata: {
            ...(call.metadata as any),
            cleanedUp: true,
            cleanedUpAt: new Date().toISOString(),
            originalStatus: call.status
          }
        });
        cleaned++;
      } catch (error: any) {
        errors.push(`Failed to cleanup call ${call.id}: ${error.message}`);
      }
    }

    return { cleaned, errors };
  }
}

export const parallelDialerVerification = new ParallelDialerVerificationService();
