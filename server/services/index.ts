import { TenantService } from './TenantService';
import { UserService } from './UserService';
import { SubscriptionService } from './SubscriptionService';

class Container {
  public readonly tenantService: TenantService;
  public readonly userService: UserService;
  public readonly subscriptionService: SubscriptionService;

  constructor() {
    this.tenantService = new TenantService();
    this.userService = new UserService();
    this.subscriptionService = new SubscriptionService();
  }
}

const container = new Container();

export const { tenantService, userService, subscriptionService } = container;
