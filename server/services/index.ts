import { TenantService } from './TenantService';
import { UserService } from './UserService';
import { SubscriptionService } from './SubscriptionService';
import { UserTwilioService } from './twilio/UserTwilioService';

class Container {
  public readonly tenantService: TenantService;
  public readonly userService: UserService;
  public readonly subscriptionService: SubscriptionService;
  public readonly twilioService: typeof UserTwilioService;

  constructor() {
    this.tenantService = new TenantService();
    this.userService = new UserService();
    this.subscriptionService = new SubscriptionService();
    this.twilioService = UserTwilioService;
  }
}

const container = new Container();

export const { tenantService, userService, subscriptionService, twilioService } = container;
