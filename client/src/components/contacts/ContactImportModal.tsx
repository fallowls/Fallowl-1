import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/useWebSocket";
import { apiRequest } from "@/lib/queryClient";
import { 
  Upload, FileSpreadsheet, MapPin, Eye, CheckCircle, XCircle, 
  AlertCircle, Download, Users, ArrowRight, Zap, Brain,
  FileText, Database, Settings
} from "lucide-react";

interface ContactImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete?: (result: any) => void;
}

interface FieldMapping {
  csvField: string;
  mappedField: string | null;
  confidence: number;
  suggestions: Array<{ field: string; confidence: number }>;
}

interface FieldGroup {
  group: string;
  label: string;
  fields: Array<{ field: string; label: string; description: string }>;
}

interface ImportOptions {
  skipDuplicates: boolean;
  updateDuplicates: boolean;
  createList: boolean;
  listName?: string;
  listDescription?: string;
}

export default function ContactImportModal({ open, onClose, onImportComplete }: ContactImportModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseResult, setParseResult] = useState<any>(null);
  const [fieldMappings, setFieldMappings] = useState<{ [csvField: string]: string }>({});
  const [previewData, setPreviewData] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    skipDuplicates: true,
    updateDuplicates: false,
    createList: true,
    listName: '',
    listDescription: ''
  });
  const [importProgress, setImportProgress] = useState<any>(null);
  const { toast } = useToast();
  const { isConnected } = useWebSocket();

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File",
        description: "Please select a CSV file",
        variant: "destructive"
      });
      return;
    }

    setFileName(file.name);
    setImportOptions(prev => ({ 
      ...prev, 
      listName: file.name.replace('.csv', '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim()
    }));

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvContent(content);
    };
    reader.readAsText(file);
  }, [toast]);

  const parseCSV = async () => {
    if (!csvContent) {
      toast({
        title: "No Data",
        description: "Please upload a CSV file first",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await apiRequest('POST', '/api/contacts/import/parse', { csvContent });
      const result = await response.json();

      setParseResult(result);
      
      // Set initial field mappings based on smart mapping
      const mappings: { [csvField: string]: string } = {};
      result.fieldMappings.forEach((mapping: FieldMapping) => {
        if (mapping.mappedField && mapping.confidence > 0.4) {
          mappings[mapping.csvField] = mapping.mappedField;
        }
      });
      setFieldMappings(mappings);
      
      setCurrentStep(2);
      toast({
        title: "CSV Parsed Successfully",
        description: `Found ${result.headers.length} columns and ${result.totalRows} rows`
      });
    } catch (error: any) {
      toast({
        title: "Parse Error",
        description: error.message || "Failed to parse CSV file",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePreview = async () => {
    setIsProcessing(true);
    try {
      const response = await apiRequest('POST', '/api/contacts/import/preview', { csvContent, fieldMappings });
      const preview = await response.json();

      setPreviewData(preview);
      setCurrentStep(3);
    } catch (error: any) {
      toast({
        title: "Preview Error",
        description: error.message || "Failed to generate preview",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const executeImport = async () => {
    setIsProcessing(true);
    setImportProgress({ stage: 'starting', progress: 0 });
    try {
      const response = await apiRequest('POST', '/api/contacts/import/execute', { csvContent, fieldMappings, options: importOptions });
      const result = await response.json();

      setImportResult(result);
      setCurrentStep(4);
      setImportProgress(null);
      
      if (result.success) {
        toast({
          title: "Import Completed",
          description: `Successfully imported ${result.importedCount} contacts`
        });
        onImportComplete?.(result);
      } else {
        toast({
          title: "Import Issues",
          description: `Imported ${result.importedCount} contacts with ${result.errorCount} errors`,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Import Error",
        description: error.message || "Failed to import contacts",
        variant: "destructive"
      });
      setImportProgress(null);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const handleImportProgress = (event: Event) => {
      const customEvent = event as CustomEvent;
      setImportProgress(customEvent.detail);
    };

    const handleImportComplete = (event: Event) => {
      const customEvent = event as CustomEvent;
      setImportResult(customEvent.detail);
      setImportProgress(null);
      setIsProcessing(false);
      setCurrentStep(4);
      
      toast({
        title: "Import Completed",
        description: `Successfully imported ${customEvent.detail.importedCount} contacts`
      });
      onImportComplete?.(customEvent.detail);
    };

    const handleImportError = (event: Event) => {
      const customEvent = event as CustomEvent;
      setImportProgress(null);
      setIsProcessing(false);
      
      toast({
        title: "Import Error",
        description: customEvent.detail.message || "Failed to import contacts",
        variant: "destructive"
      });
    };

    window.addEventListener('import_progress', handleImportProgress);
    window.addEventListener('import_complete', handleImportComplete);
    window.addEventListener('import_error', handleImportError);

    return () => {
      window.removeEventListener('import_progress', handleImportProgress);
      window.removeEventListener('import_complete', handleImportComplete);
      window.removeEventListener('import_error', handleImportError);
    };
  }, [toast, onImportComplete]);

  const updateFieldMapping = (csvField: string, mappedField: string | null) => {
    setFieldMappings(prev => ({
      ...prev,
      [csvField]: mappedField || ''
    }));
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600 bg-green-50 border-green-200";
    if (confidence >= 0.6) return "text-orange-600 bg-orange-50 border-orange-200";
    if (confidence >= 0.4) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-gray-600 bg-gray-50 border-gray-200";
  };

  const resetModal = () => {
    setCurrentStep(1);
    setCsvContent('');
    setFileName('');
    setParseResult(null);
    setFieldMappings({});
    setPreviewData(null);
    setImportResult(null);
    setImportOptions({
      skipDuplicates: true,
      updateDuplicates: false,
      createList: true,
      listName: '',
      listDescription: ''
    });
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Database className="w-5 h-5 text-blue-600" />
            </div>
            Smart Contact Import
            <Badge variant="secondary" className="ml-auto">
              <Brain className="w-3 h-3 mr-1" />
              AI-Powered Mapping
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`flex items-center ${step < 4 ? 'flex-1' : ''}`}
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${currentStep >= step 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                  }
                `}
              >
                {step}
              </div>
              {step < 4 && (
                <div
                  className={`
                    flex-1 h-1 mx-2
                    ${currentStep > step ? 'bg-blue-600' : 'bg-gray-200'}
                  `}
                />
              )}
            </div>
          ))}
        </div>

        <Tabs value={`step-${currentStep}`} className="w-full">
          {/* Step 1: Upload CSV */}
          <TabsContent value="step-1" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Upload CSV File
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <div className="space-y-2">
                    <Label htmlFor="csv-file" className="text-lg font-medium cursor-pointer hover:text-blue-600">
                      {fileName || "Choose CSV file or drag and drop"}
                    </Label>
                    <p className="text-sm text-gray-500">
                      Supported format: .csv files with headers in the first row
                    </p>
                  </div>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => document.getElementById('csv-file')?.click()}
                  >
                    Select File
                  </Button>
                </div>

                {csvContent && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      File loaded successfully. Ready to parse {csvContent.split('\n').length - 1} rows.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={parseCSV}
                    disabled={!csvContent || isProcessing}
                  >
                    {isProcessing ? "Parsing..." : "Parse CSV"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 2: Field Mapping */}
          <TabsContent value="step-2" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Smart Field Mapping
                  <Badge variant="secondary" className="ml-2">
                    <Zap className="w-3 h-3 mr-1" />
                    AI Suggested
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {parseResult && (
                  <div className="space-y-4">
                    <div className="grid gap-4">
                      {parseResult.fieldMappings.map((mapping: FieldMapping) => (
                        <div key={mapping.csvField} className="flex items-center gap-4 p-4 border rounded-lg">
                          <div className="flex-1">
                            <Label className="font-medium">{mapping.csvField}</Label>
                            <div className="text-sm text-gray-500">
                              Sample: {parseResult.data[0]?.[mapping.csvField] || 'N/A'}
                            </div>
                          </div>
                          
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                          
                          <div className="flex-1">
                            <Select
                              value={fieldMappings[mapping.csvField] || ''}
                              onValueChange={(value) => updateFieldMapping(mapping.csvField, value === 'none' ? null : value)}
                            >
                              <SelectTrigger data-testid={`select-mapping-${mapping.csvField}`}>
                                <SelectValue placeholder="Select mapping..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Don't import</SelectItem>
                                <SelectSeparator />
                                {parseResult.groupedFields?.map((group: FieldGroup, groupIndex: number) => (
                                  <SelectGroup key={group.group}>
                                    <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                      {group.label}
                                    </SelectLabel>
                                    {group.fields.map((field: { field: string; label: string }) => (
                                      <SelectItem 
                                        key={field.field} 
                                        value={field.field}
                                        data-testid={`option-${field.field}`}
                                      >
                                        {field.label}
                                      </SelectItem>
                                    ))}
                                    {groupIndex < (parseResult.groupedFields?.length || 0) - 1 && (
                                      <SelectSeparator />
                                    )}
                                  </SelectGroup>
                                )) || parseResult.availableFields?.map((field: any) => (
                                  <SelectItem key={field.field} value={field.field}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {mapping.mappedField && (
                            <Badge className={getConfidenceColor(mapping.confidence)}>
                              {Math.round(mapping.confidence * 100)}% match
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={() => setCurrentStep(1)}>
                        Back
                      </Button>
                      <Button onClick={generatePreview} disabled={isProcessing}>
                        {isProcessing ? "Generating..." : "Generate Preview"}
                        <Eye className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 3: Preview & Options */}
          <TabsContent value="step-3" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Import Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {previewData && (
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {previewData.totalValid}
                          </div>
                          <div className="text-sm text-gray-500">Valid</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-600">
                            {previewData.totalInvalid}
                          </div>
                          <div className="text-sm text-gray-500">Invalid</div>
                        </div>
                      </div>

                      {previewData.validContacts.length > 0 && (
                        <div>
                          <Label className="font-medium">Sample Valid Contacts:</Label>
                          <div className="mt-2 space-y-2 max-h-40 overflow-auto">
                            {previewData.validContacts.slice(0, 3).map((contact: any, index: number) => (
                              <div key={index} className="p-2 bg-green-50 rounded text-sm">
                                <div className="font-medium">{contact.name}</div>
                                <div className="text-gray-600">{contact.phone}</div>
                                {contact.email && <div className="text-gray-600">{contact.email}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {previewData.invalidContacts.length > 0 && (
                        <div>
                          <Label className="font-medium text-red-600">Issues Found:</Label>
                          <div className="mt-2 space-y-2 max-h-40 overflow-auto">
                            {previewData.invalidContacts.slice(0, 3).map((item: any, index: number) => (
                              <div key={index} className="p-2 bg-red-50 rounded text-sm">
                                <div className="text-red-700 text-xs">
                                  {item.errors.join(', ')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Import Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Import Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Duplicate Handling */}
                  <div className="space-y-3">
                    <Label className="font-medium">Duplicate Handling</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="skip-duplicates"
                          checked={importOptions.skipDuplicates}
                          onCheckedChange={(checked) => 
                            setImportOptions(prev => ({ ...prev, skipDuplicates: !!checked }))
                          }
                        />
                        <Label htmlFor="skip-duplicates" className="text-sm">
                          Skip duplicate contacts
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="update-duplicates"
                          checked={importOptions.updateDuplicates}
                          onCheckedChange={(checked) => 
                            setImportOptions(prev => ({ ...prev, updateDuplicates: !!checked }))
                          }
                        />
                        <Label htmlFor="update-duplicates" className="text-sm">
                          Update existing contacts
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* List Creation */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="create-list"
                        checked={importOptions.createList}
                        onCheckedChange={(checked) => 
                          setImportOptions(prev => ({ ...prev, createList: !!checked }))
                        }
                      />
                      <Label htmlFor="create-list" className="font-medium">
                        Create contact list
                      </Label>
                    </div>
                    
                    {importOptions.createList && (
                      <div className="space-y-2 pl-6">
                        <div>
                          <Label htmlFor="list-name" className="text-sm">List Name</Label>
                          <Input
                            id="list-name"
                            value={importOptions.listName || ''}
                            onChange={(e) => 
                              setImportOptions(prev => ({ ...prev, listName: e.target.value }))
                            }
                            placeholder="Enter list name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="list-description" className="text-sm">Description (Optional)</Label>
                          <Textarea
                            id="list-description"
                            value={importOptions.listDescription || ''}
                            onChange={(e) => 
                              setImportOptions(prev => ({ ...prev, listDescription: e.target.value }))
                            }
                            placeholder="Enter list description"
                            rows={2}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {importProgress && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium text-blue-900">
                        {importProgress.stage === 'validating' ? 'Validating data...' : 
                         importProgress.stage === 'processing' ? 'Importing contacts...' : 
                         'Processing...'}
                      </Label>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                        {importProgress.progress || 0}%
                      </Badge>
                    </div>
                    <Progress value={importProgress.progress || 0} className="h-2" />
                    <div className="grid grid-cols-3 gap-2 text-xs text-blue-700">
                      <div>
                        <span className="font-medium">Processed:</span> {importProgress.processedRows || 0}
                      </div>
                      <div>
                        <span className="font-medium">Imported:</span> {importProgress.importedCount || 0}
                      </div>
                      <div>
                        <span className="font-medium">Errors:</span> {importProgress.errorCount || 0}
                      </div>
                    </div>
                    {importProgress.currentBatch && importProgress.totalBatches && (
                      <div className="text-xs text-blue-600">
                        Batch {importProgress.currentBatch} of {importProgress.totalBatches}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(2)} disabled={isProcessing}>
                Back
              </Button>
              <Button
                onClick={executeImport}
                disabled={isProcessing || (previewData && previewData.totalValid === 0)}
              >
                {isProcessing ? "Importing..." : "Start Import"}
                <Database className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </TabsContent>

          {/* Step 4: Results */}
          <TabsContent value="step-4" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {importResult?.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  Import Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                {importResult && (
                  <div className="space-y-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {importResult.totalRows}
                        </div>
                        <div className="text-sm text-gray-600">Total Rows</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {importResult.importedCount}
                        </div>
                        <div className="text-sm text-gray-600">Imported</div>
                      </div>
                      <div className="text-center p-4 bg-yellow-50 rounded-lg">
                        <div className="text-2xl font-bold text-yellow-600">
                          {importResult.skippedCount}
                        </div>
                        <div className="text-sm text-gray-600">Skipped</div>
                      </div>
                      <div className="text-center p-4 bg-red-50 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">
                          {importResult.errorCount}
                        </div>
                        <div className="text-sm text-gray-600">Errors</div>
                      </div>
                    </div>

                    {/* List Creation Result */}
                    {importOptions.createList && importResult.listId && (
                      <Alert>
                        <Users className="h-4 w-4" />
                        <AlertDescription>
                          Created contact list "{importOptions.listName}" with {importResult.importedCount} contacts.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Errors */}
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div>
                        <Label className="font-medium text-red-600">Errors Details:</Label>
                        <div className="mt-2 max-h-40 overflow-auto space-y-2">
                          {importResult.errors.slice(0, 10).map((error: any, index: number) => (
                            <div key={index} className="p-2 bg-red-50 rounded text-sm">
                              <div className="font-medium">Row {error.row}:</div>
                              <div className="text-red-700">{error.errors.join(', ')}</div>
                            </div>
                          ))}
                          {importResult.errors.length > 10 && (
                            <div className="text-sm text-gray-500 text-center">
                              ... and {importResult.errors.length - 10} more errors
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <Button variant="outline" onClick={resetModal}>
                        Import Another File
                      </Button>
                      <Button onClick={handleClose}>
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}