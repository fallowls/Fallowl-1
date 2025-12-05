import { storage } from '../storage';
import { fieldMappingService } from './fieldMappingService';
import type { InsertContact } from '@shared/schema';
import { wsService } from '../websocketService';

export interface ImportOptions {
  skipDuplicates: boolean;
  updateDuplicates: boolean;
  createList: boolean;
  listName?: string;
  listDescription?: string;
}

export interface ImportResult {
  success: boolean;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{
    row: number;
    data: any;
    errors: string[];
  }>;
  duplicatesHandled: number;
  listId?: number;
}

interface BatchOperationResult {
  successCount: number;
  failedCount: number;
  createdContacts?: any[];
}

const BATCH_SIZE = 100; // Process contacts in batches for better performance

export class CsvImportService {
  /**
   * Parse CSV content and return headers and data
   */
  public parseCsvContent(csvContent: string): { headers: string[]; data: any[] } {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file must contain at least a header row and one data row');
    }

    // Parse headers
    const headers = this.parseCsvLine(lines[0]);
    
    // Parse data rows
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCsvLine(lines[i]);
      if (row.length > 0 && row.some(cell => cell.trim() !== '')) {
        const rowData: any = {};
        headers.forEach((header, index) => {
          rowData[header] = row[index] || '';
        });
        data.push(rowData);
      }
    }

    return { headers, data };
  }

  /**
   * Parse a single CSV line handling quotes and commas
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  /**
   * Import contacts from parsed CSV data with optimized batch processing
   */
  public async importContacts(
    tenantId: number,
    userId: number,
    csvData: any[],
    fieldMappings: { [csvField: string]: string },
    options: ImportOptions
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      totalRows: csvData.length,
      importedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
      duplicatesHandled: 0
    };

    try {
      console.log(`🚀 Starting import of ${csvData.length} rows for user ${userId}...`);
      
      wsService.broadcastImportProgress(userId, {
        stage: 'validating',
        progress: 0,
        totalRows: csvData.length,
        processedRows: 0,
        importedCount: 0,
        skippedCount: 0,
        errorCount: 0
      });
      
      const { valid, invalid } = fieldMappingService.validateAndTransformData(csvData, fieldMappings);
      
      invalid.forEach((item, index) => {
        result.errors.push({
          row: index + 2,
          data: item.row,
          errors: item.errors
        });
      });
      result.errorCount = invalid.length;

      let listId: number | undefined;
      if (options.createList && options.listName) {
        try {
          const list = await storage.createContactList(userId, {
            name: options.listName,
            userId: userId,
            description: options.listDescription || `Imported contacts from CSV`,
            type: 'imported',
            category: 'general'
          });
          listId = list.id;
          result.listId = listId;
          console.log(`📋 Created contact list: ${options.listName} (ID: ${listId})`);
        } catch (error) {
          console.warn('Failed to create contact list:', error);
        }
      }

      console.log('🔍 Fetching existing contacts for duplicate detection...');
      const allContacts = await storage.getAllContacts(tenantId, userId);
      const contactsByPhone = new Map(allContacts.map((c: any) => [c.phone, c]));
      console.log(`📊 Found ${allContacts.length} existing contacts`);

      const batches = [];
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        batches.push(valid.slice(i, i + BATCH_SIZE));
      }

      console.log(`⚡ Processing ${valid.length} contacts in ${batches.length} batches...`);
      
      // Track phones seen in this import to prevent intra-file duplicates
      const seenPhonesInImport = new Set<string>();
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        
        console.log(`📦 Processing batch ${batchNumber}/${batches.length} (${batch.length} contacts)...`);
        
        const newContacts: InsertContact[] = [];
        const updateOps: Array<{ id: number; data: any }> = [];
        const listMembershipOps: Array<{ contactId: number; listId: number }> = [];

        for (const contactData of batch) {
          try {
            // Check for duplicates: first in DB, then in current import
            const existingContact = contactsByPhone.get(contactData.phone);
            const duplicateInImport = seenPhonesInImport.has(contactData.phone);
            
            if (existingContact || duplicateInImport) {
              if (options.skipDuplicates) {
                result.skippedCount++;
                continue;
              } else if (options.updateDuplicates && existingContact) {
                updateOps.push({ id: existingContact.id, data: contactData });
                result.duplicatesHandled++;
                
                if (listId) {
                  listMembershipOps.push({ contactId: existingContact.id, listId });
                }
              } else if (duplicateInImport) {
                result.skippedCount++;
                continue;
              } else {
                result.skippedCount++;
                continue;
              }
            } else {
              // Mark as seen and queue new contact creation
              seenPhonesInImport.add(contactData.phone);
              
              const insertData: InsertContact = {
                name: contactData.name,
                phone: contactData.phone,
                email: contactData.email || null,
                alternatePhone: contactData.alternatePhone || null,
                company: contactData.company || null,
                industry: contactData.industry || null,
                revenue: contactData.revenue || null,
                employeeSize: contactData.employeeSize || null,
                jobTitle: contactData.jobTitle || null,
                address: contactData.address || null,
                city: contactData.city || null,
                state: contactData.state || null,
                zipCode: contactData.zipCode || null,
                country: contactData.country || 'US',
                tags: contactData.tags || [],
                notes: contactData.notes || null,
                priority: contactData.priority || 'medium',
                leadStatus: contactData.leadStatus || 'new',
                leadSource: contactData.leadSource || 'import',
                disposition: contactData.disposition || null,
                assignedTo: contactData.assignedTo || null,
                primaryListId: listId || null,
                socialProfiles: contactData.socialProfiles || {}
              };
              newContacts.push(insertData);
            }
          } catch (error: any) {
            result.errors.push({
              row: result.importedCount + result.skippedCount + result.errorCount + 2,
              data: contactData,
              errors: [error.message || 'Unknown error occurred']
            });
            result.errorCount++;
          }
        }

        // Batch create new contacts
        if (newContacts.length > 0) {
          console.log(`  ✨ Creating ${newContacts.length} new contacts...`);
          const batchResult = await this.batchCreateContacts(tenantId, userId, newContacts);
          result.importedCount += batchResult.successCount;
          result.errorCount += batchResult.failedCount;
          
          // Add to map for subsequent duplicate checks
          batchResult.createdContacts?.forEach((contact: any) => {
            contactsByPhone.set(contact.phone, contact);
          });

          // Queue list memberships for new contacts
          if (listId && batchResult.createdContacts) {
            batchResult.createdContacts.forEach((contact: any) => {
              listMembershipOps.push({ contactId: contact.id, listId });
            });
          }
        }

        // Batch update contacts
        if (updateOps.length > 0) {
          console.log(`  🔄 Updating ${updateOps.length} contacts...`);
          const updateResult = await this.batchUpdateContacts(tenantId, userId, updateOps);
          result.errorCount += updateResult.failedCount;
        }

        // Batch add to list
        if (listMembershipOps.length > 0) {
          console.log(`  📋 Adding ${listMembershipOps.length} contacts to list...`);
          const listResult = await this.batchAddToList(userId, listMembershipOps);
          if (listResult.failedCount > 0) {
            console.warn(`  ⚠️ Failed to add ${listResult.failedCount} contacts to list`);
            // Note: List add failures don't affect errorCount as contacts are already created
            // They're a post-creation step that doesn't invalidate the contact import
          }
        }

        // Broadcast progress after each batch
        const progress = Math.round(((batchIndex + 1) / batches.length) * 100);
        wsService.broadcastImportProgress(userId, {
          stage: 'processing',
          progress,
          totalRows: csvData.length,
          processedRows: (batchIndex + 1) * BATCH_SIZE,
          importedCount: result.importedCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount,
          currentBatch: batchNumber,
          totalBatches: batches.length
        });
      }

      result.success = result.errorCount < result.totalRows;

      console.log(`✅ Import complete: ${result.importedCount} imported, ${result.skippedCount} skipped, ${result.errorCount} errors`);

      wsService.broadcastImportComplete(userId, {
        success: result.success,
        totalRows: result.totalRows,
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        duplicatesHandled: result.duplicatesHandled,
        listId: result.listId
      });

      return result;
    } catch (error: any) {
      console.error('❌ Import failed:', error);
      result.errors.push({
        row: 0,
        data: {},
        errors: [error.message || 'Import process failed']
      });
      result.errorCount = result.totalRows;
      
      wsService.broadcastImportError(userId, {
        message: error.message || 'Import process failed',
        totalRows: result.totalRows,
        errorCount: result.errorCount
      });
      
      return result;
    }
  }

  /**
   * Batch create contacts - much faster than one-by-one
   */
  private async batchCreateContacts(tenantId: number, userId: number, contacts: InsertContact[]): Promise<BatchOperationResult> {
    const createdContacts: any[] = [];
    let successCount = 0;
    let failedCount = 0;
    
    const subBatchSize = 50;
    for (let i = 0; i < contacts.length; i += subBatchSize) {
      const subBatch = contacts.slice(i, i + subBatchSize);
      
      const promises = subBatch.map(contact => storage.createContact(tenantId, userId, contact));
      const results = await Promise.allSettled(promises);
      
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          createdContacts.push(result.value);
          successCount++;
        } else {
          failedCount++;
        }
      });
    }
    
    return { successCount, failedCount, createdContacts };
  }

  /**
   * Batch update contacts
   */
  private async batchUpdateContacts(tenantId: number, userId: number, updates: Array<{ id: number; data: any }>): Promise<BatchOperationResult> {
    const promises = updates.map(({ id, data }) => storage.updateContact(tenantId, userId, id, data));
    const results = await Promise.allSettled(promises);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    
    return { successCount, failedCount };
  }

  /**
   * Batch add contacts to list
   */
  private async batchAddToList(userId: number, ops: Array<{ contactId: number; listId: number }>): Promise<BatchOperationResult> {
    const promises = ops.map(({ contactId, listId }) => 
      storage.addContactToList(userId, contactId, listId).catch(() => null)
    );
    const results = await Promise.allSettled(promises);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    
    return { successCount, failedCount };
  }

  /**
   * Get import preview for validation
   */
  public getImportPreview(
    csvData: any[],
    fieldMappings: { [csvField: string]: string },
    previewLimit: number = 10
  ) {
    const { valid, invalid } = fieldMappingService.validateAndTransformData(
      csvData.slice(0, previewLimit),
      fieldMappings
    );

    return {
      validContacts: valid,
      invalidContacts: invalid,
      totalValid: valid.length,
      totalInvalid: invalid.length,
      previewLimit
    };
  }
}

export const csvImportService = new CsvImportService();
