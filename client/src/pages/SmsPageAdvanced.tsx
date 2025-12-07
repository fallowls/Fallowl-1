import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  MessageCircle, Send, Search, BarChart3, Settings, 
  Clock, Check, CheckCheck, AlertCircle, RefreshCw,
  ArrowUpRight, ArrowDownLeft, Filter, Download, Trash2,
  Bell, BellOff, Shield, Zap, TrendingUp, Users,
  Phone, Mail, Calendar, RotateCcw, Activity, Eye
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Message, Contact } from "@shared/schema";

interface SmsAnalytics {
  totalSent: number;
  totalReceived: number;
  totalDelivered: number;
  totalFailed: number;
  deliveryRate: number;
  responseRate: number;
  averageResponseTime: number;
}

interface SmsSettings {
  autoReplyEnabled: boolean;
  autoReplyMessage: string;
  dndEnabled: boolean;
  dndStartTime: string;
  dndEndTime: string;
  retryFailedEnabled: boolean;
  retryAttempts: number;
  notificationsEnabled: boolean;
}

export default function SmsPageAdvanced() {
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [activeTab, setActiveTab] = useState("inbox");
  const [messageFilter, setMessageFilter] = useState<"all" | "sent" | "received">("all");
  const [smsSettings, setSmsSettings] = useState<SmsSettings>({
    autoReplyEnabled: false,
    autoReplyMessage: "Thanks for your message! I'll get back to you shortly.",
    dndEnabled: false,
    dndStartTime: "22:00",
    dndEndTime: "08:00",
    retryFailedEnabled: true,
    retryAttempts: 3,
    notificationsEnabled: true,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClientRef = useQueryClient();

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: allMessages = [], isLoading: allMessagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
  });

  const { data: contactMessages = [], isLoading: messagesLoading, refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages/contact", selectedContactId],
    enabled: !!selectedContactId,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread/count"],
  });
  const unreadCount = unreadData?.count ?? 0;

  const { data: analytics } = useQuery<SmsAnalytics>({
    queryKey: ["/api/sms/analytics"],
  });

  useEffect(() => {
    const handleNewSms = () => {
      refetchMessages();
      queryClientRef.invalidateQueries({ queryKey: ["/api/messages"] });
    };

    const handleIncomingSms = (event: CustomEvent) => {
      refetchMessages();
      queryClientRef.invalidateQueries({ queryKey: ["/api/messages"] });
      if (smsSettings.notificationsEnabled) {
        toast({
          title: "New message received",
          description: `From: ${event.detail?.phone || 'Unknown'}`,
        });
      }
    };

    const handleSmsStatusUpdate = () => {
      refetchMessages();
    };

    window.addEventListener("new_sms", handleNewSms);
    window.addEventListener("incoming_sms", handleIncomingSms as EventListener);
    window.addEventListener("sms_status_update", handleSmsStatusUpdate);
    window.addEventListener("sms_delivered", handleSmsStatusUpdate);
    window.addEventListener("sms_failed", handleSmsStatusUpdate);

    return () => {
      window.removeEventListener("new_sms", handleNewSms);
      window.removeEventListener("incoming_sms", handleIncomingSms as EventListener);
      window.removeEventListener("sms_status_update", handleSmsStatusUpdate);
      window.removeEventListener("sms_delivered", handleSmsStatusUpdate);
      window.removeEventListener("sms_failed", handleSmsStatusUpdate);
    };
  }, [refetchMessages, queryClientRef, smsSettings.notificationsEnabled, toast]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [contactMessages]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ contactId, content }: { contactId: number; content: string }) => {
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) throw new Error("Contact not found");
      
      return await apiRequest("POST", "/api/messages", {
        contactId,
        phone: contact.phone,
        content,
        type: "sent",
        status: "pending",
        messageSource: "manual",
      });
    },
    onSuccess: () => {
      queryClientRef.invalidateQueries({ queryKey: ["/api/messages/contact", selectedContactId] });
      queryClientRef.invalidateQueries({ queryKey: ["/api/sms/analytics"] });
      queryClientRef.invalidateQueries({ queryKey: ["/api/messages"] });
      setMessageText("");
      toast({
        title: "Message sent",
        description: "Your message has been sent successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const retryMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      return await apiRequest("POST", `/api/messages/${messageId}/retry`, {});
    },
    onSuccess: () => {
      refetchMessages();
      toast({ title: "Message retry initiated" });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      return await apiRequest("DELETE", `/api/messages/${messageId}`, {});
    },
    onSuccess: () => {
      refetchMessages();
      queryClientRef.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({ title: "Message deleted" });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim() && selectedContactId && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate({ 
        contactId: selectedContactId, 
        content: messageText.trim(),
      });
    }
  };

  const selectedContact = contacts.find(c => c.id === selectedContactId);

  const getInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const getMessageStatus = (message: Message) => {
    switch (message.status) {
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-green-500" />;
      case 'sent':
        return <Check className="w-3 h-3 text-blue-500" />;
      case 'pending':
        return <Clock className="w-3 h-3 text-yellow-500 animate-pulse" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Clock className="w-3 h-3 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Delivered</Badge>;
      case 'sent':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Sent</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phone.includes(searchQuery)
  );

  const filteredMessages = allMessages.filter(msg => {
    if (messageFilter === "sent") return msg.type === "sent";
    if (messageFilter === "received") return msg.type === "received";
    return true;
  });

  const sentCount = allMessages.filter(m => m.type === 'sent').length;
  const receivedCount = allMessages.filter(m => m.type === 'received').length;
  const failedCount = allMessages.filter(m => m.status === 'failed').length;
  const deliveredCount = allMessages.filter(m => m.status === 'delivered').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">SMS Center</h1>
          <p className="text-sm text-muted-foreground">Enterprise messaging management</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {unreadCount} unread
            </Badge>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              queryClientRef.invalidateQueries({ queryKey: ["/api/messages"] });
              refetchMessages();
            }}
            data-testid="button-refresh-messages"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Sent</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{sentCount}</p>
              </div>
              <ArrowUpRight className="w-8 h-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Received</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{receivedCount}</p>
              </div>
              <ArrowDownLeft className="w-8 h-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Delivered</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{deliveredCount}</p>
              </div>
              <CheckCheck className="w-8 h-8 text-emerald-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">Failed</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{failedCount}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 h-11">
          <TabsTrigger value="inbox" className="text-sm" data-testid="tab-inbox">
            <MessageCircle className="w-4 h-4 mr-2" />
            Conversations
          </TabsTrigger>
          <TabsTrigger value="history" className="text-sm" data-testid="tab-history">
            <Clock className="w-4 h-4 mr-2" />
            Message History
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-sm" data-testid="tab-analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-sm" data-testid="tab-settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <CardTitle className="text-base">Contacts</CardTitle>
                  <Badge variant="secondary">{filteredContacts.length}</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-contacts"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {contactsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                      <Users className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">No contacts found</p>
                    </div>
                  ) : (
                    filteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        onClick={() => setSelectedContactId(contact.id)}
                        className={cn(
                          "p-4 cursor-pointer hover:bg-muted/50 border-b transition-all",
                          selectedContactId === contact.id && "bg-primary/10 border-l-4 border-l-primary"
                        )}
                        data-testid={`contact-${contact.id}`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-sm font-medium shadow-sm">
                            {getInitials(contact.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{contact.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{contact.phone}</p>
                          </div>
                          {contact.doNotSms && (
                            <BellOff className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              {selectedContact ? (
                <div className="flex flex-col h-[600px]">
                  <CardHeader className="p-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-sm font-medium">
                          {getInitials(selectedContact.name)}
                        </div>
                        <div>
                          <h3 className="font-semibold">{selectedContact.name}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            {selectedContact.phone}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          <Activity className="w-3 h-3 mr-1" />
                          Live
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 overflow-hidden p-0">
                    <ScrollArea className="h-full p-4">
                      {messagesLoading ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                        </div>
                      ) : contactMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <MessageCircle className="w-12 h-12 mb-3 opacity-30" />
                          <p className="text-sm">No messages yet</p>
                          <p className="text-xs">Send a message to start the conversation</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {contactMessages.map((message) => (
                            <div
                              key={message.id}
                              className={cn(
                                "flex group",
                                message.type === 'sent' ? 'justify-end' : 'justify-start'
                              )}
                              data-testid={`message-${message.id}`}
                            >
                              <div
                                className={cn(
                                  "max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm relative",
                                  message.type === 'sent'
                                    ? 'bg-primary text-primary-foreground rounded-br-md'
                                    : 'bg-muted rounded-bl-md'
                                )}
                              >
                                <p className="leading-relaxed text-sm">{message.content}</p>
                                <div className={cn(
                                  "flex items-center justify-between mt-1.5 text-xs gap-2",
                                  message.type === 'sent' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                )}>
                                  <span>
                                    {message.createdAt ? format(new Date(message.createdAt), 'HH:mm') : '-'}
                                  </span>
                                  {message.type === 'sent' && (
                                    <span className="flex items-center gap-1">
                                      {getMessageStatus(message)}
                                      {message.status === 'failed' && (
                                        <button
                                          onClick={() => retryMessageMutation.mutate(message.id)}
                                          className="ml-1 hover:opacity-80"
                                          title="Retry"
                                        >
                                          <RotateCcw className="w-3 h-3" />
                                        </button>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>

                  <div className="p-4 border-t bg-muted/30">
                    <form onSubmit={handleSendMessage} className="flex items-end gap-3">
                      <div className="flex-1">
                        <Textarea
                          placeholder="Type your message..."
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          className="min-h-[60px] resize-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage(e);
                            }
                          }}
                          data-testid="input-message"
                        />
                        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                          <span>{messageText.length}/160 characters</span>
                          {messageText.length > 160 && (
                            <span className="text-orange-500">
                              {Math.ceil(messageText.length / 160)} SMS segments
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="submit"
                        disabled={!messageText.trim() || sendMessageMutation.isPending}
                        className="h-[60px] px-6"
                        data-testid="button-send-message"
                      >
                        {sendMessageMutation.isPending ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Send className="w-5 h-5 mr-2" />
                            Send
                          </>
                        )}
                      </Button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
                  <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-lg font-medium">Select a contact</p>
                  <p className="text-sm">Choose a contact from the list to start messaging</p>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="p-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Message History</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant={messageFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMessageFilter("all")}
                    data-testid="filter-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={messageFilter === "sent" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMessageFilter("sent")}
                    data-testid="filter-sent"
                  >
                    <ArrowUpRight className="w-4 h-4 mr-1" />
                    Sent
                  </Button>
                  <Button
                    variant={messageFilter === "received" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMessageFilter("received")}
                    data-testid="filter-received"
                  >
                    <ArrowDownLeft className="w-4 h-4 mr-1" />
                    Received
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                  <Button variant="outline" size="sm" data-testid="button-export">
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {allMessagesLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <MessageCircle className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">No messages found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredMessages.map((message) => {
                      const contact = contacts.find(c => c.id === message.contactId);
                      return (
                        <div
                          key={message.id}
                          className="p-4 hover:bg-muted/50 transition-colors"
                          data-testid={`history-message-${message.id}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs",
                                message.type === 'sent' ? 'bg-blue-500' : 'bg-green-500'
                              )}>
                                {message.type === 'sent' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">{contact?.name || message.phone}</span>
                                  <span className="text-xs text-muted-foreground">{message.phone}</span>
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">{message.content}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {message.createdAt ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true }) : '-'}
                              </span>
                              {getStatusBadge(message.status || 'pending')}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => deleteMessageMutation.mutate(message.id)}
                                  data-testid={`delete-message-${message.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm text-muted-foreground">Delivery Rate</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">
                    {sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 0}%
                  </span>
                  <TrendingUp className="w-5 h-5 text-green-500 mb-1" />
                </div>
                <Progress value={sentCount > 0 ? (deliveredCount / sentCount) * 100 : 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm text-muted-foreground">Response Rate</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">
                    {sentCount > 0 ? Math.round((receivedCount / sentCount) * 100) : 0}%
                  </span>
                  <TrendingUp className="w-5 h-5 text-blue-500 mb-1" />
                </div>
                <Progress value={sentCount > 0 ? (receivedCount / sentCount) * 100 : 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Messages</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">{allMessages.length}</span>
                  <MessageCircle className="w-5 h-5 text-primary mb-1" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {sentCount} sent · {receivedCount} received
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm text-muted-foreground">Failed Messages</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-red-500">{failedCount}</span>
                  <AlertCircle className="w-5 h-5 text-red-500 mb-1" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {failedCount > 0 ? "Retry available" : "No failures"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Message Distribution</CardTitle>
                <CardDescription>Overview of your messaging activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                      <span className="text-sm">Sent</span>
                    </div>
                    <span className="font-medium">{sentCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full" />
                      <span className="text-sm">Received</span>
                    </div>
                    <span className="font-medium">{receivedCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                      <span className="text-sm">Delivered</span>
                    </div>
                    <span className="font-medium">{deliveredCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full" />
                      <span className="text-sm">Failed</span>
                    </div>
                    <span className="font-medium">{failedCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Stats</CardTitle>
                <CardDescription>Real-time messaging metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{contacts.length}</p>
                    <p className="text-xs text-muted-foreground">Total Contacts</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{allMessages.length}</p>
                    <p className="text-xs text-muted-foreground">Total Messages</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{unreadCount}</p>
                    <p className="text-xs text-muted-foreground">Unread</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">
                      {sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 100}%
                    </p>
                    <p className="text-xs text-muted-foreground">Success Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Auto-Reply Settings
                </CardTitle>
                <CardDescription>Configure automatic responses for incoming messages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Auto-Reply</Label>
                    <p className="text-xs text-muted-foreground">Automatically respond to incoming messages</p>
                  </div>
                  <Switch
                    checked={smsSettings.autoReplyEnabled}
                    onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, autoReplyEnabled: checked })}
                    data-testid="switch-auto-reply"
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Auto-Reply Message</Label>
                  <Textarea
                    value={smsSettings.autoReplyMessage}
                    onChange={(e) => setSmsSettings({ ...smsSettings, autoReplyMessage: e.target.value })}
                    placeholder="Enter your auto-reply message..."
                    disabled={!smsSettings.autoReplyEnabled}
                    data-testid="input-auto-reply-message"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BellOff className="w-5 h-5" />
                  Do Not Disturb
                </CardTitle>
                <CardDescription>Set quiet hours for SMS notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable DND</Label>
                    <p className="text-xs text-muted-foreground">Pause notifications during specified hours</p>
                  </div>
                  <Switch
                    checked={smsSettings.dndEnabled}
                    onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, dndEnabled: checked })}
                    data-testid="switch-dnd"
                  />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={smsSettings.dndStartTime}
                      onChange={(e) => setSmsSettings({ ...smsSettings, dndStartTime: e.target.value })}
                      disabled={!smsSettings.dndEnabled}
                      data-testid="input-dnd-start"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={smsSettings.dndEndTime}
                      onChange={(e) => setSmsSettings({ ...smsSettings, dndEndTime: e.target.value })}
                      disabled={!smsSettings.dndEnabled}
                      data-testid="input-dnd-end"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <RotateCcw className="w-5 h-5" />
                  Retry Settings
                </CardTitle>
                <CardDescription>Configure automatic retry for failed messages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Auto-Retry</Label>
                    <p className="text-xs text-muted-foreground">Automatically retry failed messages</p>
                  </div>
                  <Switch
                    checked={smsSettings.retryFailedEnabled}
                    onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, retryFailedEnabled: checked })}
                    data-testid="switch-retry"
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Max Retry Attempts</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={smsSettings.retryAttempts}
                    onChange={(e) => setSmsSettings({ ...smsSettings, retryAttempts: parseInt(e.target.value) || 3 })}
                    disabled={!smsSettings.retryFailedEnabled}
                    data-testid="input-retry-attempts"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notification Settings
                </CardTitle>
                <CardDescription>Configure how you receive SMS notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Notifications</Label>
                    <p className="text-xs text-muted-foreground">Show notifications for new messages</p>
                  </div>
                  <Switch
                    checked={smsSettings.notificationsEnabled}
                    onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, notificationsEnabled: checked })}
                    data-testid="switch-notifications"
                  />
                </div>
                <Separator />
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-primary" />
                    <span>Real-time updates via WebSocket</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Messages are delivered instantly without page refresh
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Save Settings</CardTitle>
              <CardDescription>Your settings are saved locally for this session</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => {
                  toast({ title: "Settings saved", description: "Your SMS settings have been updated." });
                }}
                data-testid="button-save-settings"
              >
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
