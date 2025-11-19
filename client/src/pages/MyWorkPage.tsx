import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Phone,
  Mail,
  Building2,
  MapPin,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  User,
  Users,
  Filter,
  Search,
  MoreVertical,
  PhoneCall,
  MessageSquare,
} from "lucide-react";
import { Lead } from "@shared/schema";
import { format } from "date-fns";

type LeadWithContact = Lead & {
  contact?: {
    name: string;
    email?: string;
    phone: string;
    company?: string;
  };
};

export default function MyWorkPage() {
  const [selectedLead, setSelectedLead] = useState<LeadWithContact | null>(null);
  const [viewType, setViewType] = useState<"all" | "high-priority" | "today">("all");

  const { data: leads = [], isLoading } = useQuery<LeadWithContact[]>({
    queryKey: ['/api/leads'],
  });

  const filteredLeads = leads.filter(lead => {
    if (viewType === "high-priority") return lead.priority === "high";
    if (viewType === "today") {
      const today = new Date();
      const nextFollowUp = lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate) : null;
      return nextFollowUp && nextFollowUp.toDateString() === today.toDateString();
    }
    return true;
  });

  const getLeadInitials = (lead: LeadWithContact) => {
    return `${lead.firstName.charAt(0)}${lead.lastName.charAt(0)}`.toUpperCase();
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900">
      {/* Left Panel - Contact List */}
      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-3" data-testid="text-my-work-title">My Work</h2>
          
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search leads..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              data-testid="input-search-leads"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={viewType === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewType("all")}
              data-testid="button-view-all"
            >
              All
            </Button>
            <Button
              variant={viewType === "high-priority" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewType("high-priority")}
              data-testid="button-view-priority"
            >
              Priority
            </Button>
            <Button
              variant={viewType === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewType("today")}
              data-testid="button-view-today"
            >
              Today
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500" data-testid="text-loading">Loading...</div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-8 text-gray-500" data-testid="text-no-leads">No leads found</div>
            ) : (
              filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    selectedLead?.id === lead.id ? "bg-lime-50 dark:bg-lime-900/20 border-l-4 border-lime-500" : ""
                  }`}
                  data-testid={`button-lead-${lead.id}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-gradient-to-br from-lime-400 to-lime-600 text-white">
                        {getLeadInitials(lead)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-sm truncate">{lead.firstName} {lead.lastName}</h3>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${
                            (lead.leadScore ?? 0) >= 80 ? "bg-green-100 text-green-800" :
                            (lead.leadScore ?? 0) >= 50 ? "bg-yellow-100 text-yellow-800" :
                            "bg-gray-100 text-gray-800"
                          }`}
                          data-testid={`badge-score-${lead.id}`}
                        >
                          {lead.leadScore ?? 0}
                        </Badge>
                      </div>
                      
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate mb-1">
                        {lead.company || "No company"}
                      </p>
                      
                      {lead.nextFollowUpDate && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          <span>{format(new Date(lead.nextFollowUpDate), "MMM d")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Lead Details */}
      {selectedLead ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-lime-400 to-lime-500 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 ring-4 ring-white dark:ring-gray-800">
                  <AvatarFallback className="bg-white text-lime-600 text-2xl font-bold">
                    {getLeadInitials(selectedLead)}
                  </AvatarFallback>
                </Avatar>
                
                <div>
                  <h1 className="text-2xl font-bold text-gray-900" data-testid="text-lead-name">
                    {selectedLead.firstName} {selectedLead.lastName}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-white text-gray-700" data-testid="badge-lead-status">
                      {selectedLead.temperature?.toUpperCase() || "COLD"}
                    </Badge>
                    <span className="text-sm text-gray-700">{selectedLead.jobTitle || "No title"}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" size="sm" data-testid="button-call">
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </Button>
                <Button variant="secondary" size="sm" data-testid="button-email">
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
                <Button variant="ghost" size="sm" data-testid="button-more">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-700 font-medium">Lead Score</div>
                <div className="text-lg font-bold text-gray-900" data-testid="text-lead-score">{selectedLead.leadScore}</div>
              </div>
              <div>
                <div className="text-gray-700 font-medium">Rating</div>
                <div className="text-lg font-bold text-gray-900">{selectedLead.temperature?.toUpperCase() || "COLD"}</div>
              </div>
              <div>
                <div className="text-gray-700 font-medium">Owner</div>
                <div className="text-lg font-bold text-gray-900">You</div>
              </div>
            </div>
          </div>

          {/* Content Tabs */}
          <ScrollArea className="flex-1 p-6">
            <Tabs defaultValue="summary" className="w-full">
              <TabsList>
                <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
                <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
                <TabsTrigger value="related" data-testid="tab-related">Related</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-6 mt-6">
                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Contact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-sm text-gray-500">Email</div>
                      <div className="font-medium" data-testid="text-email">{selectedLead.email || "No email"}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Business Phone</div>
                      <div className="font-medium" data-testid="text-phone">{selectedLead.phone}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Job Title</div>
                      <div className="font-medium">{selectedLead.jobTitle || "Not specified"}</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Up Next */}
                <Card className="border-teal-200 bg-teal-50/50 dark:bg-teal-900/10">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-teal-600" />
                      Up Next
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedLead.nextFollowUpDate ? (
                      <div className="flex items-start gap-3">
                        <div className="bg-lime-400 p-2 rounded">
                          <PhoneCall className="h-4 w-4 text-gray-900" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">Follow-up Call</div>
                          <div className="text-sm text-gray-600">
                            {format(new Date(selectedLead.nextFollowUpDate), "MMM d, yyyy 'at' h:mm a")}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" data-testid="button-complete-task">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">No upcoming tasks</div>
                    )}
                  </CardContent>
                </Card>

                {/* Lead Score */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Lead Score
                    </CardTitle>
                    <Button variant="ghost" size="sm" data-testid="button-edit-score">
                      Edit
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-center mb-4">
                      <div className="relative w-40 h-40">
                        <svg className="w-full h-full -rotate-90">
                          <circle
                            cx="80"
                            cy="80"
                            r="70"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="none"
                            className="text-gray-200 dark:text-gray-700"
                          />
                          <circle
                            cx="80"
                            cy="80"
                            r="70"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={`${((selectedLead.leadScore ?? 0) / 100) * 440} 440`}
                            className="text-teal-500"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                          <div className={`text-4xl font-bold ${getScoreColor(selectedLead.leadScore ?? 0)}`}>
                            {selectedLead.leadScore ?? 0}
                          </div>
                          <div className="text-sm text-gray-500">Grade {getScoreGrade(selectedLead.leadScore ?? 0)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span>Purchase timeframe is next quarter</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span>Purchase process is individual</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span>Lead is relatively new</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Company */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Company
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <div className="text-sm text-gray-500">Company</div>
                      <div className="font-medium">{selectedLead.company || "Not specified"}</div>
                    </div>
                    {selectedLead.industry && (
                      <div>
                        <div className="text-sm text-gray-500">Industry</div>
                        <div className="font-medium">{selectedLead.industry}</div>
                      </div>
                    )}
                    {selectedLead.location && (
                      <div>
                        <div className="text-sm text-gray-500">Location</div>
                        <div className="font-medium flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          {selectedLead.location}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Timeline
                      </div>
                      <Button variant="ghost" size="sm">
                        <Search className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {selectedLead.lastContactDate && (
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-lime-500" />
                            <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700" />
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="font-medium">Last Contact</div>
                            <div className="text-sm text-gray-500">
                              {format(new Date(selectedLead.lastContactDate), "MMM d, yyyy")}
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedLead.firstContactDate && (
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">First Contact</div>
                            <div className="text-sm text-gray-500">
                              {format(new Date(selectedLead.firstContactDate), "MMM d, yyyy")}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Who Knows Whom */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Who Knows Whom
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-500">
                      No connections available
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="details">
                <div className="text-gray-500">Detailed information coming soon...</div>
              </TabsContent>

              <TabsContent value="related">
                <div className="text-gray-500">Related records coming soon...</div>
              </TabsContent>
            </Tabs>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <User className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Lead Selected</h3>
            <p className="text-gray-500">Select a lead from the list to view details</p>
          </div>
        </div>
      )}
    </div>
  );
}
