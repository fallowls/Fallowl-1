import OpenAI from "openai";
import type { Contact, Call } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const MODEL = "gpt-5";

class OpenAIService {
  private client: OpenAI | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.isConfigured = true;
      console.log("✓ OpenAI service initialized successfully");
    } else {
      console.log("⚠ OpenAI API key not configured. AI features will be unavailable.");
      this.isConfigured = false;
    }
  }

  public checkConfiguration(): { configured: boolean; message: string } {
    if (this.isConfigured) {
      return { configured: true, message: "OpenAI is configured and ready" };
    }
    return {
      configured: false,
      message: "OpenAI API key not set. Add OPENAI_API_KEY to enable AI features.",
    };
  }

  private ensureConfigured() {
    if (!this.isConfigured || !this.client) {
      throw new Error("OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.");
    }
  }

  /**
   * Analyzes contact history and generates an AI-powered lead score
   */
  async scoreContact(contact: Contact, callHistory: Call[]): Promise<{
    overallScore: number;
    answerProbability: number;
    conversionProbability: number;
    engagementScore: number;
    scoringFactors: Record<string, any>;
    recommendations: string[];
    confidence: number;
  }> {
    this.ensureConfigured();

    try {

    const answeredCalls = callHistory.filter(c => c.status === 'completed').length;
    const totalCalls = callHistory.length;
    const answerRate = totalCalls > 0 ? answeredCalls / totalCalls : 0;
    const avgDuration = callHistory.length > 0
      ? callHistory.reduce((sum, c) => sum + (c.duration || 0), 0) / callHistory.length
      : 0;

    const prompt = `Analyze this lead's data and provide a comprehensive scoring:

Contact Information:
- Name: ${contact.name}
- Company: ${contact.company || 'Unknown'}
- Job Title: ${contact.jobTitle || 'Unknown'}
- Industry: ${contact.industry || 'Unknown'}
- Lead Status: ${contact.leadStatus}
- Priority: ${contact.priority}
- Call Attempts: ${contact.callAttempts}
- Disposition: ${contact.disposition || 'None'}

Call History:
- Total Calls: ${totalCalls}
- Answered Calls: ${answeredCalls}
- Answer Rate: ${(answerRate * 100).toFixed(1)}%
- Average Call Duration: ${avgDuration.toFixed(0)} seconds
- Last Call: ${contact.lastCallAttempt ? new Date(contact.lastCallAttempt).toLocaleDateString() : 'Never'}

Provide a JSON response with:
{
  "overallScore": number (0-100),
  "answerProbability": number (0-1, likelihood of answering next call),
  "conversionProbability": number (0-1, likelihood of conversion),
  "engagementScore": number (0-100),
  "scoringFactors": {
    "positiveFactors": ["factor1", "factor2"],
    "negativeFactors": ["factor1", "factor2"],
    "keyInsights": ["insight1", "insight2"]
  },
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"],
  "confidence": number (0-1, confidence in this analysis)
}`;

    const response = await this.client!.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert sales analyst. Analyze lead data and provide scoring based on likelihood to answer calls and convert. Be data-driven and realistic."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      overallScore: Math.max(0, Math.min(100, result.overallScore || 0)),
      answerProbability: Math.max(0, Math.min(1, result.answerProbability || 0)),
      conversionProbability: Math.max(0, Math.min(1, result.conversionProbability || 0)),
      engagementScore: Math.max(0, Math.min(100, result.engagementScore || 0)),
      scoringFactors: result.scoringFactors || {},
      recommendations: result.recommendations || [],
      confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
    };
    } catch (error) {
      console.error("Error scoring contact:", error);
      throw error;
    }
  }

  /**
   * Predicts optimal call times based on historical answer patterns
   */
  async predictBestCallTimes(contact: Contact, callHistory: Call[]): Promise<{
    bestCallTimes: Array<{ hour: number; day: string; probability: number }>;
    timezone: string;
    callPatterns: Record<string, any>;
  }> {
    this.ensureConfigured();

    const answeredCalls = callHistory.filter(c => c.status === 'completed');
    const timeData = answeredCalls.map(call => ({
      hour: new Date(call.createdAt!).getHours(),
      day: new Date(call.createdAt!).toLocaleDateString('en-US', { weekday: 'long' }),
      duration: call.duration || 0
    }));

    const prompt = `Analyze call patterns and predict the best times to call this contact:

Contact Timezone: ${contact.timezone || 'Unknown'}

Historical Call Data (answered calls only):
${timeData.length > 0 ? JSON.stringify(timeData, null, 2) : 'No answered calls yet'}

Total Calls Made: ${callHistory.length}
Answered Calls: ${answeredCalls.length}

Provide a JSON response with:
{
  "bestCallTimes": [
    {"hour": 14, "day": "Tuesday", "probability": 0.85},
    {"hour": 10, "day": "Wednesday", "probability": 0.78}
  ],
  "timezone": "America/New_York",
  "callPatterns": {
    "preferredDays": ["Tuesday", "Wednesday"],
    "preferredHours": [10, 14, 15],
    "avoidTimes": ["Monday morning", "Friday afternoon"],
    "insights": ["Contact tends to answer mid-week afternoons"]
  }
}

If there's insufficient data, provide general best practice recommendations.`;

    const response = await this.client!.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert in sales call timing optimization. Analyze patterns and provide data-driven recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      bestCallTimes: result.bestCallTimes || [],
      timezone: result.timezone || contact.timezone || "America/New_York",
      callPatterns: result.callPatterns || {},
    };
  }

  /**
   * Generates a personalized opening script for a contact
   */
  async generateOpeningScript(contact: Contact, callHistory: Call[]): Promise<{
    script: string;
    talkingPoints: string[];
    objectionResponses: Record<string, string>;
  }> {
    this.ensureConfigured();

    const lastCall = callHistory[0];
    const prompt = `Generate a personalized opening script for this sales call:

Contact:
- Name: ${contact.name}
- Company: ${contact.company || 'their company'}
- Job Title: ${contact.jobTitle || 'Unknown'}
- Industry: ${contact.industry || 'Unknown'}
- Current Status: ${contact.leadStatus}
- Last Disposition: ${contact.disposition || 'First call'}
- Notes: ${contact.notes || 'None'}

Call Context:
- Previous Calls: ${callHistory.length}
- Last Call: ${lastCall ? new Date(lastCall.createdAt!).toLocaleDateString() : 'First call'}

Provide a JSON response with:
{
  "script": "Hi [Name], this is [Your Name] from...",
  "talkingPoints": ["point1", "point2", "point3"],
  "objectionResponses": {
    "too_busy": "I understand you're busy. This will only take 2 minutes...",
    "not_interested": "I appreciate that. Many of our best clients said the same initially..."
  }
}`;

    const response = await this.client!.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert sales script writer. Create natural, conversational scripts that build rapport quickly."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      script: result.script || "",
      talkingPoints: result.talkingPoints || [],
      objectionResponses: result.objectionResponses || {},
    };
  }

  /**
   * Analyzes a call recording transcript and generates intelligence
   */
  async analyzeCallTranscript(transcript: string, contactName: string): Promise<{
    summary: string;
    sentiment: string;
    sentimentScore: number;
    actionItems: Array<{ action: string; priority: string; dueDate?: string }>;
    keywords: string[];
    topics: string[];
    objections: Array<{ objection: string; response: string }>;
    recommendedDisposition: string;
    suggestedFollowUp: string;
    nextBestAction: string;
    coachingTips: Array<{ tip: string; category: string }>;
    strengths: string[];
    improvements: string[];
    confidence: number;
  }> {
    this.ensureConfigured();

    const prompt = `Analyze this sales call transcript and provide comprehensive intelligence:

Contact: ${contactName}

Transcript:
${transcript}

Provide a detailed JSON analysis with:
{
  "summary": "Brief 2-3 sentence summary of the call",
  "sentiment": "positive/neutral/negative/mixed",
  "sentimentScore": number (-1 to 1),
  "actionItems": [
    {"action": "Send pricing proposal", "priority": "high", "dueDate": "2024-01-15"}
  ],
  "keywords": ["pricing", "implementation", "timeline"],
  "topics": ["Product Demo", "Pricing Discussion", "Timeline"],
  "objections": [
    {"objection": "Too expensive", "response": "Addressed value vs cost"}
  ],
  "recommendedDisposition": "qualified/interested/callback-requested/not-interested/etc",
  "suggestedFollowUp": "Send proposal by end of week",
  "nextBestAction": "Email detailed pricing breakdown with case study",
  "coachingTips": [
    {"tip": "Great job building rapport early", "category": "rapport"},
    {"tip": "Could ask more discovery questions", "category": "discovery"}
  ],
  "strengths": ["Active listening", "Handled objections well"],
  "improvements": ["Ask about budget earlier", "Clarify decision-making process"],
  "confidence": number (0-1)
}`;

    const response = await this.client!.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert sales call analyst and coach. Provide actionable insights that help sales reps improve."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      summary: result.summary || "",
      sentiment: result.sentiment || "neutral",
      sentimentScore: Math.max(-1, Math.min(1, result.sentimentScore || 0)),
      actionItems: result.actionItems || [],
      keywords: result.keywords || [],
      topics: result.topics || [],
      objections: result.objections || [],
      recommendedDisposition: result.recommendedDisposition || "",
      suggestedFollowUp: result.suggestedFollowUp || "",
      nextBestAction: result.nextBestAction || "",
      coachingTips: result.coachingTips || [],
      strengths: result.strengths || [],
      improvements: result.improvements || [],
      confidence: Math.max(0, Math.min(1, result.confidence || 0.7)),
    };
  }

  /**
   * Transcribes audio file using Whisper
   */
  async transcribeAudio(audioBuffer: Buffer, filename: string): Promise<{ text: string; duration: number }> {
    this.ensureConfigured();

    // Create a file object from buffer
    const file = new File([audioBuffer], filename, { type: 'audio/wav' });

    const transcription = await this.client!.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
    });

    return {
      text: transcription.text,
      duration: 0, // Whisper API doesn't return duration
    };
  }

  /**
   * Analyzes campaign performance and provides optimization recommendations
   */
  async analyzeCampaignPerformance(campaignData: {
    name: string;
    totalCalls: number;
    answeredCalls: number;
    conversions: number;
    avgCallDuration: number;
    commonDispositions: Array<{ disposition: string; count: number }>;
  }): Promise<{
    insights: string[];
    recommendations: string[];
    estimatedImprovements: Record<string, string>;
    priorityActions: Array<{ action: string; impact: string; effort: string }>;
  }> {
    this.ensureConfigured();

    const answerRate = (campaignData.answeredCalls / campaignData.totalCalls * 100).toFixed(1);
    const conversionRate = (campaignData.conversions / campaignData.totalCalls * 100).toFixed(1);

    const prompt = `Analyze this campaign's performance and provide optimization recommendations:

Campaign: ${campaignData.name}
- Total Calls: ${campaignData.totalCalls}
- Answered: ${campaignData.answeredCalls} (${answerRate}%)
- Conversions: ${campaignData.conversions} (${conversionRate}%)
- Avg Call Duration: ${campaignData.avgCallDuration}s

Common Dispositions:
${JSON.stringify(campaignData.commonDispositions, null, 2)}

Provide a JSON response with:
{
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["recommendation1", "recommendation2"],
  "estimatedImprovements": {
    "answerRate": "+15% with optimal timing",
    "conversionRate": "+8% with improved messaging"
  },
  "priorityActions": [
    {
      "action": "Adjust calling times to 2-4pm EST",
      "impact": "high",
      "effort": "low"
    }
  ]
}`;

    const response = await this.client!.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert in sales campaign optimization. Provide data-driven, actionable recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      insights: result.insights || [],
      recommendations: result.recommendations || [],
      estimatedImprovements: result.estimatedImprovements || {},
      priorityActions: result.priorityActions || [],
    };
  }
}

// Export singleton instance
export const openaiService = new OpenAIService();
