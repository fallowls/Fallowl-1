import { FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../../storage';
import { recordingService } from '../../services/recordingService';
import { userTwilioCache } from '../../userTwilioService';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/errors';
import fs from 'fs';

export async function getRecordings(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

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
  
  return reply.send(recordings);
}

export async function getRecordingStats(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!tenantId || !userId) throw new UnauthorizedError();

  const stats = await storage.getRecordingStats(tenantId, userId);
  return reply.send(stats);
}

export async function syncRecordings(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) throw new UnauthorizedError();

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
}

export async function getRecordingSettings(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) throw new UnauthorizedError();

  const user = await storage.getUser(userId);
  if (!user) throw new NotFoundError("User not found");

  const autoSync = await storage.getSetting(user.tenantId, `recording_auto_sync_user_${user.id}`);
  const downloadLocal = await storage.getSetting(user.tenantId, `recording_download_local_user_${user.id}`);
  const autoTranscript = await storage.getSetting(user.tenantId, `recording_auto_transcript_user_${user.id}`);
  const sentimentAnalysis = await storage.getSetting(user.tenantId, `recording_sentiment_analysis_user_${user.id}`);
  const retentionPeriod = await storage.getSetting(user.tenantId, `recording_retention_period_user_${user.id}`);

  return reply.send({
    autoSync: autoSync?.value === true || autoSync?.value === "true" || false,
    downloadLocal: downloadLocal?.value === true || downloadLocal?.value === "true" || false,
    autoTranscript: autoTranscript?.value === true || autoTranscript?.value === "true" || false,
    sentimentAnalysis: sentimentAnalysis?.value === true || sentimentAnalysis?.value === "true" || false,
    retentionPeriod: retentionPeriod?.value || "1year"
  });
}

export async function updateRecordingSettings(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) throw new UnauthorizedError();

  const user = await storage.getUser(userId);
  if (!user) throw new NotFoundError("User not found");

  const { setting, value } = (request.body || {}) as any;
  
  const validSettings = ['autoSync', 'downloadLocal', 'autoTranscript', 'sentimentAnalysis', 'retentionPeriod'];
  if (!validSettings.includes(setting)) {
    throw new BadRequestError("Invalid setting name");
  }

  const settingKey = `recording_${setting.replace(/([A-Z])/g, '_$1').toLowerCase()}_user_${user.id}`;
  await storage.setSetting(user.tenantId, settingKey, value);
  
  return reply.send({
    success: true,
    message: `${setting} setting updated successfully`,
    setting,
    value
  });
}

export async function deleteRecording(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const tenantId = (request as any).tenantId;
  if (!userId || !tenantId) throw new UnauthorizedError();

  const { id } = request.params as { id: string };
  const recordingId = parseInt(id);
  
  const recording = await storage.getRecording(tenantId, userId, recordingId);
  
  if (!recording) throw new NotFoundError("Recording not found");

  if (recording.localFilePath && fs.existsSync(recording.localFilePath)) {
    fs.unlinkSync(recording.localFilePath);
  }

  await storage.deleteRecording(tenantId, userId, recordingId);
  return reply.send({ message: "Recording deleted successfully" });
}
