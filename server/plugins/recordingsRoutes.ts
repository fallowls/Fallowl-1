import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { recordingService } from '../services/recordingService';
import { userTwilioCache } from '../userTwilioService';
import { insertRecordingSchema } from '@shared/schema';
import { rateLimitConfigs } from './rateLimiters';
import fs from 'fs';
import { getUserIdFromRequest } from '../authHelper';
import type { HasUserId } from '../authHelper';

/**
 * Recordings Management Routes Plugin for Fastify
 * Migrated from Express routes
 */
export default async function recordingsRoutes(fastify: FastifyInstance) {
  // GET /recordings - Get all recordings with advanced filtering and pagination
  fastify.get('/recordings', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { 
        page = 1,
        limit = 50,
        search,
        status,
        category,
        direction,
        startDate,
        endDate,
        hasTranscript,
        sentiment,
        starred,
        archived,
        sortBy,
        sortOrder
      } = (request.query || {}) as any;

      console.log(`📼 Fetching recordings for user ${userId}, tenant ${tenantId}: page=${page}, limit=${limit}, filters=${JSON.stringify({ search, status, direction })}`);

      const filters = {
        search: search as string,
        status: status as string,
        category: category as string,
        direction: direction as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        hasTranscript: hasTranscript === 'true',
        sentiment: sentiment as string,
        starred: starred === 'true',
        archived: archived === 'true'
      };

      const recordings = await storage.getRecordings(tenantId, userId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        filters,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      });
      
      console.log(`✅ Successfully fetched ${recordings.recordings.length} recordings for user ${userId} (total: ${recordings.total})`);
      return reply.send(recordings);
    } catch (error: any) {
      console.error('❌ Failed to fetch recordings:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /recordings/stats - Get recording statistics and analytics
  fastify.get('/recordings/stats', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      console.log(`📊 Fetching recording stats for user ${userId}, tenant ${tenantId}`);
      const stats = await storage.getRecordingStats(tenantId, userId);
      return reply.send(stats);
    } catch (error: any) {
      console.error('❌ Failed to fetch recording stats:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /recordings/sync - Sync recordings from Twilio
  fastify.post('/recordings/sync', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { 
        forceRefresh = false, 
        downloadToLocal = false,
        generateTranscription = false,
        syncAll = false,
        dateRange
      } = (request.body || {}) as any;

      const options = {
        forceRefresh,
        downloadToLocal,
        generateTranscription,
        syncAll,
        dateRange: dateRange ? {
          startDate: new Date(dateRange.startDate),
          endDate: new Date(dateRange.endDate)
        } : undefined
      };

      const result = await recordingService.syncRecordingsFromTwilio(userId, options);
      return reply.send({
        message: "Recording sync completed",
        ...result
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /recordings/settings - Get recording settings
  fastify.get('/recordings/settings', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const tenantId = (request as any).tenantId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      const autoSync = await storage.getSetting(`recording_auto_sync_user_${user.id}`);
      const downloadLocal = await storage.getSetting(`recording_download_local_user_${user.id}`);
      const autoTranscript = await storage.getSetting(`recording_auto_transcript_user_${user.id}`);
      const sentimentAnalysis = await storage.getSetting(`recording_sentiment_analysis_user_${user.id}`);
      const retentionPeriod = await storage.getSetting(`recording_retention_period_user_${user.id}`);

      return reply.send({
        autoSync: autoSync?.value === true || autoSync?.value === "true" || false,
        downloadLocal: downloadLocal?.value === true || downloadLocal?.value === "true" || false,
        autoTranscript: autoTranscript?.value === true || autoTranscript?.value === "true" || false,
        sentimentAnalysis: sentimentAnalysis?.value === true || sentimentAnalysis?.value === "true" || false,
        retentionPeriod: retentionPeriod?.value || "1year"
      });
    } catch (error: any) {
      console.error("Error getting recording settings:", error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /recordings/settings - Update recording settings
  fastify.post('/recordings/settings', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return reply.code(404).send({ message: "User not found" });
      }

      const { setting, value } = (request.body || {}) as any;
      
      const validSettings = ['autoSync', 'downloadLocal', 'autoTranscript', 'sentimentAnalysis', 'retentionPeriod'];
      if (!validSettings.includes(setting)) {
        return reply.code(400).send({ error: "Invalid setting name" });
      }

      const settingKey = `recording_${setting.replace(/([A-Z])/g, '_$1').toLowerCase()}_user_${user.id}`;
      await storage.setSetting(settingKey, value);
      
      console.log(`✅ Recording setting ${setting} updated to ${value} for user ${user.id}`);
      
      return reply.send({
        success: true,
        message: `${setting} setting updated successfully`,
        setting,
        value
      });
    } catch (error: any) {
      console.error("Error updating recording setting:", error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // GET /recordings/migration-status - Get migration status
  fastify.get('/recordings/migration-status', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      console.log(`📊 Recording migration status requested by user ${userId}`);

      const { bunnycdnService } = await import('../services/bunnycdnService');
      
      const allRecordings = await storage.getAllRecordings(userId);
      
      const fullyMigrated = allRecordings.filter((r: any) => 
        r.bunnycdnUrl && r.bunnycdnUploadedAt && r.twilioDeletedAt
      );
      
      const uploadedNotDeleted = allRecordings.filter((r: any) => 
        r.bunnycdnUrl && r.bunnycdnUploadedAt && !r.twilioDeletedAt && r.twilioUrl
      );
      
      const failedUploads = allRecordings.filter((r: any) => {
        const metadata = r.metadata as any || {};
        return metadata.bunnycdnWorkflowError || metadata.bunnycdnUploadError || r.status === 'error';
      });
      
      const notMigrated = allRecordings.filter((r: any) => 
        !r.bunnycdnUrl && r.twilioUrl
      );
      
      const inProgress = allRecordings.filter((r: any) => 
        r.status === 'processing'
      );

      const bunnyConfigured = bunnycdnService.isConfigured();
      
      let storageStats = null;
      if (bunnyConfigured) {
        try {
          storageStats = await bunnycdnService.getStorageStatistics();
        } catch (error: any) {
          console.warn('Could not fetch storage stats:', error.message);
        }
      }

      const status = {
        bunnycdn: {
          configured: bunnyConfigured,
          storageStats: storageStats
        },
        recordings: {
          total: allRecordings.length,
          fullyMigrated: fullyMigrated.length,
          uploadedNotDeleted: uploadedNotDeleted.length,
          failedUploads: failedUploads.length,
          notMigrated: notMigrated.length,
          inProgress: inProgress.length
        },
        details: {
          fullyMigrated: fullyMigrated.map((r: any) => ({
            id: r.id,
            twilioSid: r.twilioRecordingSid,
            cdnUrl: r.bunnycdnUrl,
            uploadedAt: r.bunnycdnUploadedAt,
            deletedAt: r.twilioDeletedAt
          })),
          uploadedNotDeleted: uploadedNotDeleted.map((r: any) => ({
            id: r.id,
            twilioSid: r.twilioRecordingSid,
            cdnUrl: r.bunnycdnUrl,
            twilioUrl: r.twilioUrl,
            issue: 'Uploaded to BunnyCDN but still on Twilio',
            metadata: (r.metadata as any)?.twilioDeleteError ? {
              deleteError: (r.metadata as any).twilioDeleteError
            } : null
          })),
          failedUploads: failedUploads.map((r: any) => {
            const metadata = r.metadata as any || {};
            return {
              id: r.id,
              twilioSid: r.twilioRecordingSid,
              twilioUrl: r.twilioUrl,
              error: metadata.bunnycdnWorkflowError || metadata.bunnycdnUploadError || 'Unknown error',
              errorAt: metadata.bunnycdnWorkflowErrorAt || metadata.bunnycdnUploadFailedAt
            };
          }),
          notMigrated: notMigrated.map((r: any) => ({
            id: r.id,
            twilioSid: r.twilioRecordingSid,
            twilioUrl: r.twilioUrl,
            status: r.status,
            reason: (r.metadata as any)?.bunnycdnSkipReason || 'Not yet migrated'
          }))
        },
        health: {
          migrationRate: allRecordings.length > 0 
            ? ((fullyMigrated.length / allRecordings.length) * 100).toFixed(1) + '%'
            : 'N/A',
          failureRate: allRecordings.length > 0
            ? ((failedUploads.length / allRecordings.length) * 100).toFixed(1) + '%'
            : 'N/A',
          status: failedUploads.length > allRecordings.length * 0.1 
            ? 'degraded'
            : fullyMigrated.length === allRecordings.length && allRecordings.length > 0
            ? 'healthy'
            : 'normal'
        }
      };

      return reply.send(status);
    } catch (error: any) {
      console.error('❌ Failed to get migration status:', error);
      return reply.code(500).send({ 
        message: 'Failed to get migration status', 
        error: error.message 
      });
    }
  });

  // POST /recordings/bulk-migrate-bunnycdn - Bulk migrate to BunnyCDN
  fastify.post('/recordings/bulk-migrate-bunnycdn', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { limit = 100 } = (request.body || {}) as any;
      
      console.log(`📤 Bulk BunnyCDN migration requested for user ${userId} (limit: ${limit})`);
      
      const { bunnycdnService } = await import('../services/bunnycdnService');
      
      if (!bunnycdnService.isConfigured()) {
        return reply.code(400).send({ 
          message: "BunnyCDN is not configured. Please set BUNNYCDN_API_KEY, BUNNYCDN_STORAGE_ZONE, and BUNNYCDN_STORAGE_PASSWORD." 
        });
      }

      const { client: twilioClient, credentials } = await userTwilioCache.getTwilioClient(userId);
      
      if (!twilioClient || !credentials) {
        return reply.code(400).send({ 
          message: "Twilio credentials not configured for your account" 
        });
      }

      const allRecordings = await storage.getAllRecordings(userId);
      const recordingsToMigrate = allRecordings
        .filter((r: any) => !r.bunnycdnUrl && r.twilioUrl)
        .slice(0, limit);

      console.log(`📊 Found ${recordingsToMigrate.length} recordings to migrate (out of ${allRecordings.length} total)`);

      if (recordingsToMigrate.length === 0) {
        return reply.send({
          message: "No recordings to migrate",
          total: 0,
          uploaded: 0,
          failed: 0,
          results: []
        });
      }

      const batchSize = 3;
      const results: any[] = [];
      let uploaded = 0;
      let failed = 0;

      for (let i = 0; i < recordingsToMigrate.length; i += batchSize) {
        const batch = recordingsToMigrate.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (recording: any) => {
            try {
              const result = await bunnycdnService.migrateRecordingToBunnyCDN(
                userId,
                recording.id,
                twilioClient,
                credentials
              );
              
              if (result.uploaded) {
                uploaded++;
              } else {
                failed++;
              }
              
              return {
                recordingId: recording.id,
                twilioRecordingSid: recording.twilioRecordingSid,
                success: result.uploaded,
                deleted: result.deleted,
                cdnUrl: result.cdnUrl
              };
            } catch (error: any) {
              failed++;
              return {
                recordingId: recording.id,
                twilioRecordingSid: recording.twilioRecordingSid,
                success: false,
                error: error.message
              };
            }
          })
        );

        batchResults.forEach((result: any) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              success: false,
              error: result.reason?.message || 'Unknown error'
            });
          }
        });

        if (i + batchSize < recordingsToMigrate.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`✅ Bulk migration completed: ${uploaded} uploaded, ${failed} failed`);

      return reply.send({
        message: "Bulk migration completed",
        total: recordingsToMigrate.length,
        uploaded,
        failed,
        results
      });
    } catch (error: any) {
      console.error(`❌ Bulk BunnyCDN migration failed:`, error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /recordings/cleanup - Cleanup old recordings
  fastify.post('/recordings/cleanup', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      console.log(`🧹 Starting recording cleanup for user ${userId}`);
      const deletedCount = await recordingService.cleanupOldRecordings(userId);
      console.log(`✅ Cleanup completed for user ${userId}: ${deletedCount} recordings deleted`);
      return reply.send({
        message: "Cleanup completed",
        deletedCount
      });
    } catch (error: any) {
      console.error('❌ Cleanup failed:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /recordings/:id - Get individual recording details
  fastify.get('/recordings/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      console.log(`📼 Fetching recording ${recordingId} for user ${userId}`);
      
      const recording = await storage.getRecording(userId, recordingId);
      
      if (!recording) {
        console.warn(`⚠️ Recording ${recordingId} not found for user ${userId}`);
        return reply.code(404).send({ message: "Recording not found" });
      }

      await storage.updateRecording(userId, recordingId, {
        playCount: (recording.playCount || 0) + 1,
        lastPlayedAt: new Date()
      });

      console.log(`✅ Recording ${recordingId} fetched successfully for user ${userId}`);
      return reply.send(recording);
    } catch (error: any) {
      console.error('❌ Failed to fetch recording:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /recordings/:id/play - Stream/play recording audio
  fastify.get('/recordings/:id/play', {
    config: {
      rateLimit: rateLimitConfigs.download
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      console.log(`▶️ Playing recording ${recordingId} for user ${userId}`);
      
      const recording = await storage.getRecording(userId, recordingId);
      
      if (!recording) {
        console.warn(`⚠️ Recording ${recordingId} not found for user ${userId}`);
        return reply.code(404).send({ message: "Recording not found" });
      }

      if (recording.bunnycdnUrl) {
        console.log(`🐰 Streaming from BunnyCDN for recording ${recordingId} (proxied)`);
        try {
          const axios = (await import('axios')).default;
          const { bunnycdnService } = await import('../services/bunnycdnService');
          const range = request.headers.range;
          
          const playbackUrl = bunnycdnService.isSecureAccessConfigured()
            ? bunnycdnService.generateSignedUrl(recording.bunnycdnUrl, { 
                expiresIn: 3600
              })
            : recording.bunnycdnUrl;
          
          console.log(`🔒 Using ${bunnycdnService.isSecureAccessConfigured() ? 'signed' : 'public'} URL for server-proxied playback`);
          
          const axiosConfig: any = {
            responseType: 'stream',
            timeout: 60000
          };
          
          if (range) {
            axiosConfig.headers = { Range: range };
          }
          
          const response = await axios.get(playbackUrl, axiosConfig);
          
          reply.header('X-Content-Type-Options', 'nosniff');
          reply.header('X-Frame-Options', 'DENY');
          
          if (response.status === 206) {
            reply.code(206);
            if (response.headers['content-range']) {
              reply.header('Content-Range', response.headers['content-range']);
            }
            if (response.headers['accept-ranges']) {
              reply.header('Accept-Ranges', response.headers['accept-ranges']);
            }
          }
          
          if (response.headers['content-length']) {
            reply.header('Content-Length', response.headers['content-length']);
          }
          reply.header('Content-Type', 'audio/mpeg');
          
          return reply.send(response.data);
        } catch (error: any) {
          console.error(`❌ Failed to stream from storage for recording ${recordingId}:`, error.message);
          return reply.code(500).send({ message: "Failed to stream recording" });
        }
      } else if (recording.twilioUrl) {
        console.log(`🔗 Redirecting to Twilio URL for recording ${recordingId}`);
        return reply.redirect(recording.twilioUrl);
      } else {
        console.error(`❌ Recording ${recordingId} has no available file or URL`);
        return reply.code(404).send({ message: "Recording file not found" });
      }
    } catch (error: any) {
      console.error('❌ Failed to play recording:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // GET /recordings/:id/download - Download recording
  fastify.get('/recordings/:id/download', {
    config: {
      rateLimit: rateLimitConfigs.download
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      console.log(`📥 Downloading recording ${recordingId} for user ${userId}`);
      
      const recording = await storage.getRecording(userId, recordingId);
      
      if (!recording) {
        console.warn(`⚠️ Recording ${recordingId} not found for user ${userId}`);
        return reply.code(404).send({ message: "Recording not found" });
      }

      await storage.updateRecording(userId, recordingId, {
        downloadCount: (recording.downloadCount || 0) + 1,
        lastDownloadedAt: new Date()
      });

      const fileName = `recording_${recording.twilioRecordingSid}_${recording.phone}.mp3`;

      if (recording.bunnycdnUrl) {
        console.log(`🐰 Downloading from BunnyCDN for recording ${recordingId} (proxied)`);
        try {
          const axios = (await import('axios')).default;
          const { bunnycdnService } = await import('../services/bunnycdnService');
          
          const downloadUrl = bunnycdnService.isSecureAccessConfigured()
            ? bunnycdnService.generateSignedUrl(recording.bunnycdnUrl, { 
                expiresIn: 1800
              })
            : recording.bunnycdnUrl;
          
          console.log(`🔒 Using ${bunnycdnService.isSecureAccessConfigured() ? 'signed' : 'public'} URL for server-proxied download`);
          
          const response = await axios.get(downloadUrl, {
            responseType: 'stream',
            timeout: 60000
          });
          
          reply.header('X-Content-Type-Options', 'nosniff');
          reply.header('X-Frame-Options', 'DENY');
          reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
          reply.header('Content-Type', 'audio/mpeg');
          
          return reply.send(response.data);
        } catch (error: any) {
          console.error(`❌ Failed to download from storage for recording ${recordingId}:`, error.message);
          return reply.code(500).send({ message: "Failed to download recording" });
        }
      } else if (recording.twilioUrl) {
        console.log(`🔗 Downloading from Twilio URL for recording ${recordingId}`);
        return reply.redirect(recording.twilioUrl);
      } else {
        console.error(`❌ Recording ${recordingId} has no available file or URL`);
        return reply.code(404).send({ message: "Recording file not found" });
      }
    } catch (error: any) {
      console.error('❌ Failed to download recording:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /recordings/:id/transcript - Generate transcript for recording
  fastify.post('/recordings/:id/transcript', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      console.log(`🎤 Generating transcript for recording ${recordingId}, user ${userId}`);
      
      const transcript = await recordingService.generateTranscript(userId, recordingId);
      console.log(`✅ Transcript generated for recording ${recordingId}`);
      return reply.send({ transcript });
    } catch (error: any) {
      console.error('❌ Failed to generate transcript:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /recordings/:id/analyze - Analyze recording with AI
  fastify.post('/recordings/:id/analyze', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      console.log(`🧠 Analyzing recording ${recordingId} for user ${userId}`);
      
      await recordingService.analyzeRecording(userId, recordingId);
      
      const updatedRecording = await storage.getRecording(userId, recordingId);
      console.log(`✅ Recording ${recordingId} analyzed successfully`);
      return reply.send({ 
        message: "Recording analyzed successfully",
        analysis: {
          summary: updatedRecording?.summary,
          sentiment: updatedRecording?.sentiment,
          keywords: updatedRecording?.keywords,
          topics: updatedRecording?.topics,
          actionItems: updatedRecording?.actionItems
        }
      });
    } catch (error: any) {
      console.error('❌ Failed to analyze recording:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // PUT /recordings/:id - Update recording metadata
  fastify.put('/recordings/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      const updateData = request.body as any;
      
      const allowedFields = ['tags', 'category', 'priority', 'isStarred', 'isArchived', 'customFields'];
      const filteredData = Object.keys(updateData)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = updateData[key];
          return obj;
        }, {} as any);

      const recording = await storage.updateRecording(userId, recordingId, {
        ...filteredData,
        updatedAt: new Date()
      });
      
      return reply.send(recording);
    } catch (error: any) {
      return reply.code(400).send({ message: error.message });
    }
  });

  // POST /recordings/bulk/:action - Bulk operations on recordings
  fastify.post('/recordings/bulk/:action', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { action } = request.params as { action: string };
      const { recordingIds, data } = request.body as any;

      if (!recordingIds || !Array.isArray(recordingIds)) {
        return reply.code(400).send({ message: "Recording IDs are required" });
      }

      const results = [];

      switch (action) {
        case 'delete':
          for (const id of recordingIds) {
            try {
              await storage.deleteRecording(userId, id);
              results.push({ id, status: 'deleted' });
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        case 'archive':
          for (const id of recordingIds) {
            try {
              await storage.updateRecording(userId, id, { isArchived: true });
              results.push({ id, status: 'archived' });
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        case 'star':
          for (const id of recordingIds) {
            try {
              await storage.updateRecording(userId, id, { isStarred: true });
              results.push({ id, status: 'starred' });
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        case 'tag':
          if (!data.tags) {
            return reply.code(400).send({ message: "Tags are required for tag action" });
          }
          for (const id of recordingIds) {
            try {
              const recording = await storage.getRecording(userId, id);
              if (recording) {
                const existingTags = recording.tags || [];
                const combinedTags = [...existingTags, ...data.tags];
                const uniqueTagsSet = new Set(combinedTags);
                const newTags = Array.from(uniqueTagsSet);
                await storage.updateRecording(userId, id, { tags: newTags });
                results.push({ id, status: 'tagged' });
              }
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        case 'categorize':
          if (!data.category) {
            return reply.code(400).send({ message: "Category is required for categorize action" });
          }
          for (const id of recordingIds) {
            try {
              await storage.updateRecording(userId, id, { category: data.category });
              results.push({ id, status: 'categorized' });
            } catch (error: any) {
              results.push({ id, status: 'error', error: error.message });
            }
          }
          break;

        default:
          return reply.code(400).send({ message: "Invalid bulk action" });
      }

      return reply.send({
        message: `Bulk ${action} completed`,
        results
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /recordings/:id/download-local - Download from Twilio and store locally
  fastify.post('/recordings/:id/download-local', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      const recording = await storage.getRecording(userId, recordingId);
      
      if (!recording) {
        return reply.code(404).send({ message: "Recording not found" });
      }

      if (!recording.twilioRecordingSid) {
        return reply.code(400).send({ message: "No Twilio recording SID found" });
      }

      const filePath = await recordingService.downloadRecording(userId, recording.twilioRecordingSid);
      return reply.send({ 
        message: "Recording downloaded successfully",
        localPath: filePath
      });
    } catch (error: any) {
      return reply.code(500).send({ message: error.message });
    }
  });

  // POST /recordings/:id/migrate-bunnycdn - Migrate recording to BunnyCDN
  fastify.post('/recordings/:id/migrate-bunnycdn', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      
      console.log(`📤 Manual BunnyCDN migration requested for recording ${recordingId} by user ${userId}`);
      
      const { bunnycdnService } = await import('../services/bunnycdnService');
      
      if (!bunnycdnService.isConfigured()) {
        return reply.code(400).send({ 
          message: "BunnyCDN is not configured. Please set BUNNYCDN_API_KEY, BUNNYCDN_STORAGE_ZONE, and BUNNYCDN_STORAGE_PASSWORD." 
        });
      }

      const recording = await storage.getRecording(userId, recordingId);
      if (!recording) {
        return reply.code(404).send({ message: "Recording not found" });
      }

      const { client: twilioClient, credentials } = await userTwilioCache.getTwilioClient(userId);
      
      if (!twilioClient || !credentials) {
        return reply.code(400).send({ 
          message: "Twilio credentials not configured for your account" 
        });
      }

      const result = await bunnycdnService.migrateRecordingToBunnyCDN(
        userId,
        recordingId,
        twilioClient,
        credentials
      );

      return reply.send({
        message: "Migration completed",
        uploaded: result.uploaded,
        deleted: result.deleted,
        cdnUrl: result.cdnUrl,
        recordingId: recordingId
      });
    } catch (error: any) {
      console.error('❌ BunnyCDN migration failed:', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  // DELETE /recordings/:id - Delete recording (with file cleanup)
  fastify.delete('/recordings/:id', {
    config: {
      rateLimit: rateLimitConfigs.api
    },
    preHandler: (fastify as any).requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any as HasUserId).userId;
      if (!userId) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const { id } = request.params as { id: string };
      const recordingId = parseInt(id);
      console.log(`🗑️ Deleting recording ${recordingId} for user ${userId}`);
      
      const recording = await storage.getRecording(userId, recordingId);
      
      if (!recording) {
        console.warn(`⚠️ Recording ${recordingId} not found for user ${userId}`);
        return reply.code(404).send({ message: "Recording not found" });
      }

      if (recording.localFilePath && fs.existsSync(recording.localFilePath)) {
        console.log(`🗑️ Deleting local file: ${recording.localFilePath}`);
        fs.unlinkSync(recording.localFilePath);
      }

      await storage.deleteRecording(userId, recordingId);
      console.log(`✅ Recording ${recordingId} deleted successfully for user ${userId}`);
      return reply.send({ message: "Recording deleted successfully" });
    } catch (error: any) {
      console.error('❌ Failed to delete recording:', error);
      return reply.code(400).send({ message: error.message });
    }
  });
}
