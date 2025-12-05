/**
 * Smart NLP-based Field Mapping Service with Learning Capabilities
 * Features:
 * - Grouped field categories (Contact Info, Company Info, Location)
 * - Pattern matching and semantic analysis
 * - Self-learning from user imports
 * - Only essential contact fields (no lead management fields)
 */

import { db } from '../db';
import { fieldMappingPatterns } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface ContactFieldMapping {
  csvField: string;
  mappedField: string | null;
  confidence: number;
  suggestions: Array<{ field: string; confidence: number }>;
}

export interface FieldPattern {
  field: string;
  patterns: string[];
  keywords: string[];
  aliases: string[];
  weight: number;
}

export interface FieldGroup {
  group: string;
  label: string;
  fields: Array<{ field: string; label: string; description: string }>;
}

export interface LearnedMapping {
  csvHeader: string;
  mappedField: string;
  confidence: number;
  usageCount: number;
}

export class FieldMappingService {
  // Only essential contact fields - removed lead management fields (after country)
  private fieldPatterns: FieldPattern[] = [
    // Contact Information
    {
      field: 'name',
      patterns: ['^(full_?)?name$', '^contact_?name$', '^customer_?name$', '^person$', '^individual$'],
      keywords: ['name', 'fullname', 'contact', 'person', 'individual', 'customer'],
      aliases: ['full_name', 'contact_name', 'customer_name', 'person_name', 'individual_name'],
      weight: 1.0
    },
    {
      field: 'firstName',
      patterns: ['^first_?name$', '^fname$', '^given_?name$', '^forename$'],
      keywords: ['first', 'given', 'forename', 'fname'],
      aliases: ['first_name', 'given_name', 'fname', 'firstname'],
      weight: 0.95
    },
    {
      field: 'lastName',
      patterns: ['^last_?name$', '^lname$', '^surname$', '^family_?name$'],
      keywords: ['last', 'surname', 'family', 'lname'],
      aliases: ['last_name', 'surname', 'family_name', 'lname', 'lastname'],
      weight: 0.95
    },
    {
      field: 'phone',
      patterns: ['^phone(_?number)?$', '^mobile$', '^cell$', '^telephone$', '^tel$', '^contact_?number$', '^primary_?phone$'],
      keywords: ['phone', 'mobile', 'cell', 'telephone', 'tel', 'number', 'contact'],
      aliases: ['phone_number', 'mobile_number', 'cell_phone', 'telephone_number', 'contact_number', 'primary_phone'],
      weight: 1.0
    },
    {
      field: 'alternatePhone',
      patterns: ['^(alt|alternate|alternative|secondary|other)_?phone$', '^phone_?2$', '^backup_?phone$', '^work_?phone$', '^office_?phone$'],
      keywords: ['alternate', 'alternative', 'secondary', 'other', 'backup', 'second', 'work', 'office'],
      aliases: ['alt_phone', 'phone2', 'secondary_phone', 'backup_phone', 'other_phone', 'work_phone', 'office_phone'],
      weight: 0.9
    },
    {
      field: 'email',
      patterns: ['^e?mail(_?address)?$', '^contact_?email$', '^email_?addr$', '^primary_?email$'],
      keywords: ['email', 'mail', 'address', 'contact'],
      aliases: ['email_address', 'mail_address', 'contact_email', 'e_mail', 'primary_email'],
      weight: 1.0
    },

    // Company Information
    {
      field: 'company',
      patterns: ['^company(_?name)?$', '^organization$', '^org$', '^business$', '^employer$', '^firm$', '^corporation$', '^enterprise$'],
      keywords: ['company', 'organization', 'business', 'employer', 'firm', 'corp', 'enterprise'],
      aliases: ['company_name', 'organization_name', 'business_name', 'employer_name', 'corporation_name'],
      weight: 0.9
    },
    {
      field: 'industry',
      patterns: ['^industry$', '^business_?type$', '^sector$', '^vertical$', '^market$', '^field$'],
      keywords: ['industry', 'business', 'sector', 'vertical', 'market', 'type', 'field'],
      aliases: ['business_type', 'industry_type', 'market_sector', 'industry_sector'],
      weight: 0.8
    },
    {
      field: 'jobTitle',
      patterns: ['^(job_?)?title$', '^position$', '^role$', '^designation$', '^job_?position$', '^occupation$'],
      keywords: ['title', 'position', 'role', 'designation', 'job', 'occupation'],
      aliases: ['job_title', 'job_position', 'work_title', 'position_title', 'role_title'],
      weight: 0.9
    },
    {
      field: 'revenue',
      patterns: ['^(annual_?)?revenue$', '^income$', '^turnover$', '^sales$', '^arr$'],
      keywords: ['revenue', 'income', 'turnover', 'sales', 'annual', 'arr'],
      aliases: ['annual_revenue', 'company_revenue', 'yearly_revenue', 'total_revenue'],
      weight: 0.7
    },
    {
      field: 'employeeSize',
      patterns: ['^employee(_?size|_?count)?$', '^staff_?size$', '^team_?size$', '^headcount$', '^company_?size$', '^num_?employees$'],
      keywords: ['employee', 'staff', 'team', 'headcount', 'size', 'count'],
      aliases: ['employee_count', 'staff_count', 'team_count', 'company_size', 'num_employees', 'number_of_employees'],
      weight: 0.7
    },

    // Location Information
    {
      field: 'address',
      patterns: ['^(street_?)?address$', '^addr$', '^location$', '^street$', '^address_?line'],
      keywords: ['address', 'street', 'location', 'addr', 'line'],
      aliases: ['street_address', 'mailing_address', 'physical_address', 'address_line_1'],
      weight: 0.8
    },
    {
      field: 'city',
      patterns: ['^city$', '^town$', '^locality$', '^municipality$'],
      keywords: ['city', 'town', 'locality', 'municipality'],
      aliases: ['city_name', 'town_name', 'locality_name'],
      weight: 0.9
    },
    {
      field: 'state',
      patterns: ['^state$', '^province$', '^region$', '^territory$'],
      keywords: ['state', 'province', 'region', 'territory'],
      aliases: ['state_name', 'province_name', 'region_name', 'state_province'],
      weight: 0.9
    },
    {
      field: 'zipCode',
      patterns: ['^(zip|postal)_?code$', '^zip$', '^postcode$', '^pin_?code$'],
      keywords: ['zip', 'postal', 'code', 'postcode', 'pin'],
      aliases: ['zip_code', 'postal_code', 'post_code', 'pincode'],
      weight: 0.8
    },
    {
      field: 'country',
      patterns: ['^country$', '^nation$', '^country_?code$'],
      keywords: ['country', 'nation'],
      aliases: ['country_name', 'country_code', 'nation_name'],
      weight: 0.8
    },

    // Social & Web Profiles
    {
      field: 'linkedinProfile',
      patterns: ['^linkedin(_?profile|_?url)?$', '^li_?profile$', '^personal_?linkedin$', '^profile_?linkedin$'],
      keywords: ['linkedin', 'li', 'profile'],
      aliases: ['linkedin_profile', 'linkedin_url', 'personal_linkedin', 'linkedin_link', 'linkedin_page'],
      weight: 0.9
    },
    {
      field: 'companyLinkedinProfile',
      patterns: ['^company_?linkedin(_?profile|_?url)?$', '^org_?linkedin$', '^business_?linkedin$', '^corporate_?linkedin$'],
      keywords: ['company', 'linkedin', 'corporate', 'business', 'organization'],
      aliases: ['company_linkedin', 'company_linkedin_profile', 'company_linkedin_url', 'org_linkedin', 'business_linkedin'],
      weight: 0.85
    },
    {
      field: 'website',
      patterns: ['^website(_?url)?$', '^web$', '^url$', '^site$', '^homepage$', '^company_?website$', '^personal_?website$'],
      keywords: ['website', 'web', 'url', 'site', 'homepage'],
      aliases: ['website_url', 'web_url', 'company_website', 'personal_website', 'home_page', 'site_url'],
      weight: 0.9
    }
  ];

  // Learned patterns from database - cached in memory
  private learnedPatterns: Map<string, LearnedMapping[]> = new Map();
  private lastLearnedFetch: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Normalize field names for comparison
   */
  private normalizeField(field: string): string {
    return field
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[j][i] = matrix[j - 1][i - 1];
        } else {
          matrix[j][i] = Math.min(
            matrix[j - 1][i - 1] + 1,
            matrix[j][i - 1] + 1,
            matrix[j - 1][i] + 1
          );
        }
      }
    }

    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : (maxLen - matrix[len2][len1]) / maxLen;
  }

  /**
   * Fetch learned patterns from database
   */
  private async fetchLearnedPatterns(tenantId?: number): Promise<void> {
    const now = Date.now();
    if (now - this.lastLearnedFetch < this.CACHE_TTL) {
      return; // Use cached data
    }

    try {
      const patterns = await db
        .select()
        .from(fieldMappingPatterns)
        .where(tenantId ? eq(fieldMappingPatterns.tenantId, tenantId) : sql`TRUE`)
        .orderBy(sql`${fieldMappingPatterns.usageCount} DESC`);

      this.learnedPatterns.clear();
      for (const pattern of patterns) {
        const key = pattern.csvHeaderNormalized;
        if (!this.learnedPatterns.has(key)) {
          this.learnedPatterns.set(key, []);
        }
        this.learnedPatterns.get(key)!.push({
          csvHeader: pattern.csvHeader,
          mappedField: pattern.mappedField,
          confidence: parseFloat(pattern.learnedConfidence || '0'),
          usageCount: pattern.usageCount || 1
        });
      }
      this.lastLearnedFetch = now;
    } catch (error) {
      console.error('Error fetching learned patterns:', error);
    }
  }

  /**
   * Get learned confidence boost for a CSV field -> contact field mapping
   */
  private getLearnedConfidence(csvField: string, contactField: string): number {
    const normalized = this.normalizeField(csvField);
    const learned = this.learnedPatterns.get(normalized);
    
    if (!learned) return 0;
    
    const match = learned.find(l => l.mappedField === contactField);
    if (!match) return 0;
    
    // Boost based on usage count (logarithmic scaling)
    const usageBoost = Math.min(0.3, Math.log10(match.usageCount + 1) * 0.15);
    return Math.min(0.5, match.confidence + usageBoost);
  }

  /**
   * Score a field match using multiple criteria including learned patterns
   */
  private scoreFieldMatch(csvField: string, pattern: FieldPattern): number {
    const normalizedCsvField = this.normalizeField(csvField);
    let score = 0;

    // Check learned patterns first (highest priority)
    const learnedBoost = this.getLearnedConfidence(csvField, pattern.field);
    if (learnedBoost > 0) {
      score += learnedBoost;
    }

    // Check regex patterns
    for (const regexPattern of pattern.patterns) {
      const regex = new RegExp(regexPattern, 'i');
      if (regex.test(normalizedCsvField)) {
        score += 0.8 * pattern.weight;
        break;
      }
    }

    // Check exact keyword matches
    for (const keyword of pattern.keywords) {
      if (normalizedCsvField.includes(keyword)) {
        score += 0.5 * pattern.weight;
        break;
      }
    }

    // Check aliases using similarity
    for (const alias of pattern.aliases) {
      const similarity = this.calculateSimilarity(normalizedCsvField, this.normalizeField(alias));
      if (similarity > 0.85) {
        score += similarity * 0.7 * pattern.weight;
        break;
      }
    }

    // Check direct similarity with field name
    const fieldSimilarity = this.calculateSimilarity(normalizedCsvField, pattern.field.toLowerCase());
    if (fieldSimilarity > 0.75) {
      score += fieldSimilarity * 0.8 * pattern.weight;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Map CSV fields to contact schema fields with NLP and learning
   */
  public async mapFields(csvHeaders: string[], tenantId?: number): Promise<ContactFieldMapping[]> {
    // Fetch learned patterns
    await this.fetchLearnedPatterns(tenantId);

    const mappings: ContactFieldMapping[] = [];

    for (const csvField of csvHeaders) {
      const scores: Array<{ field: string; confidence: number }> = [];

      // Score against all field patterns
      for (const pattern of this.fieldPatterns) {
        const confidence = this.scoreFieldMatch(csvField, pattern);
        if (confidence > 0.1) {
          scores.push({ field: pattern.field, confidence });
        }
      }

      // Sort by confidence
      scores.sort((a, b) => b.confidence - a.confidence);

      // Determine best match
      const bestMatch = scores[0];
      const mappedField = bestMatch && bestMatch.confidence > 0.4 ? bestMatch.field : null;

      mappings.push({
        csvField,
        mappedField,
        confidence: bestMatch ? bestMatch.confidence : 0,
        suggestions: scores.slice(0, 5)
      });
    }

    // Handle conflicts - if multiple CSV fields map to the same contact field,
    // keep only the one with highest confidence
    const usedFields = new Set<string>();
    const finalMappings = mappings.map(mapping => {
      if (mapping.mappedField && usedFields.has(mapping.mappedField)) {
        const existingMapping = mappings.find(m => 
          m.mappedField === mapping.mappedField && m !== mapping
        );
        
        if (existingMapping && existingMapping.confidence > mapping.confidence) {
          return { ...mapping, mappedField: null, confidence: 0 };
        } else {
          if (existingMapping) {
            existingMapping.mappedField = null;
            existingMapping.confidence = 0;
          }
          usedFields.add(mapping.mappedField);
          return mapping;
        }
      } else if (mapping.mappedField) {
        usedFields.add(mapping.mappedField);
        return mapping;
      }
      
      return mapping;
    });

    return finalMappings;
  }

  /**
   * Learn from a successful import - save mapping patterns
   */
  public async learnFromImport(
    fieldMappings: { [csvField: string]: string },
    tenantId?: number
  ): Promise<void> {
    try {
      for (const [csvField, contactField] of Object.entries(fieldMappings)) {
        if (!contactField || contactField === 'none' || contactField === '') continue;

        const normalized = this.normalizeField(csvField);
        
        // Check if this pattern already exists
        const existing = await db
          .select()
          .from(fieldMappingPatterns)
          .where(
            and(
              eq(fieldMappingPatterns.csvHeaderNormalized, normalized),
              eq(fieldMappingPatterns.mappedField, contactField),
              tenantId 
                ? eq(fieldMappingPatterns.tenantId, tenantId)
                : sql`${fieldMappingPatterns.tenantId} IS NULL`
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update existing pattern - increment usage count and boost confidence
          const newCount = (existing[0].usageCount || 1) + 1;
          const newConfidence = Math.min(0.5, parseFloat(existing[0].learnedConfidence || '0') + 0.05);
          
          await db
            .update(fieldMappingPatterns)
            .set({
              usageCount: newCount,
              learnedConfidence: String(newConfidence),
              lastUsedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(fieldMappingPatterns.id, existing[0].id));
        } else {
          // Insert new learned pattern
          await db
            .insert(fieldMappingPatterns)
            .values({
              tenantId: tenantId || null,
              csvHeader: csvField,
              csvHeaderNormalized: normalized,
              mappedField: contactField,
              usageCount: 1,
              learnedConfidence: '0.1',
              lastUsedAt: new Date()
            });
        }
      }

      // Invalidate cache to pick up new patterns
      this.lastLearnedFetch = 0;
    } catch (error) {
      console.error('Error learning from import:', error);
    }
  }

  /**
   * Get available contact fields grouped by category
   * Only essential fields - no lead management options
   */
  public getAvailableFields(): Array<{ field: string; label: string; description: string }> {
    return [
      // Contact Information
      { field: 'name', label: 'Full Name', description: 'Contact\'s full name' },
      { field: 'firstName', label: 'First Name', description: 'Contact\'s first name' },
      { field: 'lastName', label: 'Last Name', description: 'Contact\'s last name' },
      { field: 'phone', label: 'Phone Number', description: 'Primary phone number' },
      { field: 'email', label: 'Email Address', description: 'Primary email address' },
      { field: 'alternatePhone', label: 'Alternate Phone', description: 'Secondary phone number' },
      // Company Information
      { field: 'company', label: 'Company', description: 'Company or organization name' },
      { field: 'industry', label: 'Industry', description: 'Business industry or sector' },
      { field: 'jobTitle', label: 'Job Title', description: 'Position or role title' },
      { field: 'revenue', label: 'Revenue', description: 'Annual revenue' },
      { field: 'employeeSize', label: 'Employee Size', description: 'Number of employees' },
      // Location Information
      { field: 'address', label: 'Address', description: 'Street address' },
      { field: 'city', label: 'City', description: 'City name' },
      { field: 'state', label: 'State/Province', description: 'State or province' },
      { field: 'zipCode', label: 'ZIP/Postal Code', description: 'ZIP or postal code' },
      { field: 'country', label: 'Country', description: 'Country name or code' },
      // Social & Web Profiles
      { field: 'linkedinProfile', label: 'LinkedIn Profile', description: 'Personal LinkedIn profile URL' },
      { field: 'companyLinkedinProfile', label: 'Company LinkedIn', description: 'Company LinkedIn page URL' },
      { field: 'website', label: 'Website', description: 'Personal or company website URL' }
    ];
  }

  /**
   * Get available contact fields grouped by category for UI
   */
  public getGroupedFields(): FieldGroup[] {
    return [
      {
        group: 'contact',
        label: 'Contact Information',
        fields: [
          { field: 'name', label: 'Full Name', description: 'Contact\'s full name' },
          { field: 'firstName', label: 'First Name', description: 'Contact\'s first name' },
          { field: 'lastName', label: 'Last Name', description: 'Contact\'s last name' },
          { field: 'phone', label: 'Phone Number', description: 'Primary phone number' },
          { field: 'email', label: 'Email Address', description: 'Primary email address' },
          { field: 'alternatePhone', label: 'Alternate Phone', description: 'Secondary phone number' }
        ]
      },
      {
        group: 'company',
        label: 'Company Information',
        fields: [
          { field: 'company', label: 'Company', description: 'Company or organization name' },
          { field: 'industry', label: 'Industry', description: 'Business industry or sector' },
          { field: 'jobTitle', label: 'Job Title', description: 'Position or role title' },
          { field: 'revenue', label: 'Revenue', description: 'Annual revenue' },
          { field: 'employeeSize', label: 'Employee Size', description: 'Number of employees' }
        ]
      },
      {
        group: 'location',
        label: 'Location Information',
        fields: [
          { field: 'address', label: 'Address', description: 'Street address' },
          { field: 'city', label: 'City', description: 'City name' },
          { field: 'state', label: 'State/Province', description: 'State or province' },
          { field: 'zipCode', label: 'ZIP/Postal Code', description: 'ZIP or postal code' },
          { field: 'country', label: 'Country', description: 'Country name or code' }
        ]
      },
      {
        group: 'social',
        label: 'Social & Web Profiles',
        fields: [
          { field: 'linkedinProfile', label: 'LinkedIn Profile', description: 'Personal LinkedIn profile URL' },
          { field: 'companyLinkedinProfile', label: 'Company LinkedIn', description: 'Company LinkedIn page URL' },
          { field: 'website', label: 'Website', description: 'Personal or company website URL' }
        ]
      }
    ];
  }

  /**
   * Validate and transform imported data
   */
  public validateAndTransformData(
    rawData: any[], 
    fieldMappings: { [csvField: string]: string }
  ): { valid: any[]; invalid: Array<{ row: any; errors: string[] }> } {
    const valid: any[] = [];
    const invalid: Array<{ row: any; errors: string[] }> = [];

    for (const row of rawData) {
      const transformedRow: any = {};
      const errors: string[] = [];

      // Transform fields according to mapping
      for (const [csvField, contactField] of Object.entries(fieldMappings)) {
        if (contactField && contactField !== 'none' && row[csvField] !== undefined && row[csvField] !== '') {
          const value = this.transformFieldValue(contactField, row[csvField]);
          transformedRow[contactField] = value;
        }
      }

      // Auto-generate full name from firstName and lastName if name is not mapped
      if (!transformedRow.name || transformedRow.name.trim() === '') {
        const firstName = transformedRow.firstName?.trim() || '';
        const lastName = transformedRow.lastName?.trim() || '';
        
        if (firstName || lastName) {
          transformedRow.name = `${firstName} ${lastName}`.trim();
        }
      }

      // Validate required fields
      if (!transformedRow.name || transformedRow.name.trim() === '') {
        errors.push('Name is required');
      }
      
      if (!transformedRow.phone || transformedRow.phone.trim() === '') {
        errors.push('Phone number is required');
      }

      // Validate phone number format
      if (transformedRow.phone && !this.isValidPhone(transformedRow.phone)) {
        errors.push('Invalid phone number format');
      }

      // Validate email format if provided
      if (transformedRow.email && !this.isValidEmail(transformedRow.email)) {
        errors.push('Invalid email format');
      }

      // Consolidate social profile fields into socialProfiles object
      const socialProfiles: any = {};
      if (transformedRow.linkedinProfile) {
        socialProfiles.linkedin = transformedRow.linkedinProfile;
        delete transformedRow.linkedinProfile;
      }
      if (transformedRow.companyLinkedinProfile) {
        socialProfiles.companyLinkedin = transformedRow.companyLinkedinProfile;
        delete transformedRow.companyLinkedinProfile;
      }
      if (transformedRow.website) {
        socialProfiles.website = transformedRow.website;
        delete transformedRow.website;
      }
      
      // Only add socialProfiles if there's at least one value
      if (Object.keys(socialProfiles).length > 0) {
        transformedRow.socialProfiles = socialProfiles;
      }

      if (errors.length === 0) {
        valid.push(transformedRow);
      } else {
        invalid.push({ row: transformedRow, errors });
      }
    }

    return { valid, invalid };
  }

  /**
   * Transform field values to appropriate types
   */
  private transformFieldValue(field: string, value: any): any {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const stringValue = String(value).trim();

    switch (field) {
      case 'phone':
      case 'alternatePhone':
        return this.cleanPhoneNumber(stringValue);
      
      default:
        return stringValue;
    }
  }

  /**
   * Clean and format phone number
   */
  private cleanPhoneNumber(phone: string): string {
    // Remove all non-digit characters except + at the beginning
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // If it starts with +1, keep it; if it's 10 digits, add +1
    if (cleaned.startsWith('+1')) {
      return cleaned;
    } else if (cleaned.length === 10) {
      return '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Validate phone number
   */
  private isValidPhone(phone: string): boolean {
    const cleaned = phone.replace(/[^\d]/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const fieldMappingService = new FieldMappingService();
