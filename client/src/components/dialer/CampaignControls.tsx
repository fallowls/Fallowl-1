import { Play, Pause, Square, Users, TrendingUp, Target, Calendar, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DialerCampaign } from "@shared/parallelDialerTypes";

interface CampaignControlsProps {
  campaigns: DialerCampaign[];
  selectedCampaignId?: number;
  onCampaignSelect: (campaignId: number) => void;
  onCampaignStart?: (campaignId: number) => void;
  onCampaignPause?: (campaignId: number) => void;
  onCampaignStop?: (campaignId: number) => void;
}

export function CampaignControls({
  campaigns,
  selectedCampaignId,
  onCampaignSelect,
  onCampaignStart,
  onCampaignPause,
  onCampaignStop
}: CampaignControlsProps) {
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500 dark:bg-green-600';
      case 'paused': return 'bg-yellow-500 dark:bg-yellow-600';
      case 'completed': return 'bg-gray-500 dark:bg-gray-600';
      case 'scheduled': return 'bg-blue-500 dark:bg-blue-600';
      default: return 'bg-gray-500 dark:bg-gray-600';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 dark:text-red-500';
      case 'medium': return 'text-blue-600 dark:text-blue-500';
      case 'low': return 'text-gray-600 dark:text-gray-500';
      default: return 'text-gray-600 dark:text-gray-500';
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800" data-testid="card-campaign-controls">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
          Campaign Control
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Campaign Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Select Campaign
          </label>
          <Select
            value={selectedCampaignId?.toString()}
            onValueChange={(value) => onCampaignSelect(parseInt(value))}
          >
            <SelectTrigger data-testid="select-campaign">
              <SelectValue placeholder="Choose a campaign..." />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id.toString()}>
                  <div className="flex items-center gap-2">
                    <span>{campaign.name}</span>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", getStatusColor(campaign.status))}
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campaign Details */}
        {selectedCampaign && (
          <div className="space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            {/* Campaign Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white" data-testid="text-campaign-name">
                  {selectedCampaign.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={getStatusColor(selectedCampaign.status)}>
                    {selectedCampaign.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {selectedCampaign.mode}
                  </Badge>
                  <span className={cn("text-xs font-medium", getPriorityColor(selectedCampaign.priority))}>
                    {selectedCampaign.priority} priority
                  </span>
                </div>
              </div>
            </div>

            {/* Campaign Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Leads</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white" data-testid="text-total-leads">
                  {selectedCampaign.totalLeads}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Contacted</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white" data-testid="text-contacted-leads">
                  {selectedCampaign.contactedLeads}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Remaining</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white" data-testid="text-remaining-leads">
                  {selectedCampaign.remainingLeads}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Success Rate</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-500" data-testid="text-success-rate">
                  {selectedCampaign.successRate.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Campaign Progress</span>
                <span>
                  {selectedCampaign.contactedLeads} / {selectedCampaign.totalLeads}
                </span>
              </div>
              <Progress
                value={(selectedCampaign.contactedLeads / selectedCampaign.totalLeads) * 100}
                className="h-2"
                data-testid="progress-campaign"
              />
            </div>

            {/* Daily Limit */}
            {selectedCampaign.dailyCallLimit && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Daily Call Limit</span>
                  <span>
                    {selectedCampaign.callsMadeToday} / {selectedCampaign.dailyCallLimit}
                  </span>
                </div>
                <Progress
                  value={(selectedCampaign.callsMadeToday / selectedCampaign.dailyCallLimit) * 100}
                  className="h-2"
                  data-testid="progress-daily-limit"
                />
              </div>
            )}

            {/* Campaign Info */}
            <div className="space-y-2 text-sm">
              {selectedCampaign.assignedAgents.length > 0 && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Users className="w-4 h-4" />
                  <span>{selectedCampaign.assignedAgents.length} agents assigned</span>
                </div>
              )}
              {selectedCampaign.tags.length > 0 && (
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <div className="flex flex-wrap gap-1">
                    {selectedCampaign.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Campaign Controls */}
            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {selectedCampaign.status === 'scheduled' || selectedCampaign.status === 'paused' ? (
                <Button
                  onClick={() => onCampaignStart?.(selectedCampaign.id)}
                  className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
                  data-testid="button-start-campaign"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Campaign
                </Button>
              ) : selectedCampaign.status === 'active' ? (
                <>
                  <Button
                    onClick={() => onCampaignPause?.(selectedCampaign.id)}
                    variant="outline"
                    className="flex-1"
                    data-testid="button-pause-campaign"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                  <Button
                    onClick={() => onCampaignStop?.(selectedCampaign.id)}
                    variant="destructive"
                    className="flex-1"
                    data-testid="button-stop-campaign"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Campaign List Summary */}
        {!selectedCampaign && campaigns.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Available Campaigns
            </p>
            <div className="space-y-2">
              {campaigns.slice(0, 3).map((campaign) => (
                <div
                  key={campaign.id}
                  onClick={() => onCampaignSelect(campaign.id)}
                  className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  data-testid={`campaign-summary-${campaign.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {campaign.name}
                    </span>
                    <Badge variant="outline" className={cn("text-xs", getStatusColor(campaign.status))}>
                      {campaign.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{campaign.contactedLeads} / {campaign.totalLeads} leads</span>
                    <span className="text-green-600 dark:text-green-500 font-medium">
                      {campaign.successRate.toFixed(1)}% success
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {campaigns.length === 0 && (
          <div className="text-center py-8">
            <Target className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No campaigns available
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
