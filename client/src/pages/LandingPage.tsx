import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { 
  Phone, 
  MessageSquare, 
  Users, 
  BarChart3, 
  Shield, 
  Zap, 
  CheckCircle,
  Star,
  ArrowRight,
  PhoneCall,
  Headphones,
  Globe,
  Smartphone,
  Clock,
  TrendingUp,
  Award,
  Target,
  Lightbulb,
  Rocket,
  Database,
  Cloud,
  Lock,
  Wifi,
  Download,
  Play,
  Calendar,
  Mail,
  FileText,
  Settings,
  PieChart,
  Activity,
  MapPin,
  Building,
  CreditCard,
  Search,
  Filter,
  Tag,
  UserCheck,
  Bell,
  RefreshCw,
  Heart,
  ThumbsUp,
  Briefcase,
  MonitorSpeaker,
  Calculator,
  Mic,
  Video,
  Layers,
  BarChart,
  Workflow,
  Sparkles,
  Bot,
  Megaphone,
  Timer,
  UserPlus,
  Repeat,
  PlayCircle,
  Send,
  AlertCircle,
  Gauge,
  LineChart,
  PenTool,
  Palette,
  Code,
  Cpu,
  HardDrive,
  Monitor,
  Smartphone as SmartphoneIcon
} from "lucide-react";

// Import logos
import ClosoLogo from "@assets/closo_logo_png_1768808340025.png";

export default function LandingPage() {
  const heroFeatures = [
    {
      icon: <Phone className="h-6 w-6" />,
      title: "Smart Dialer",
      description: "AI-powered calling with intelligent routing"
    },
    {
      icon: <MessageSquare className="h-6 w-6" />,
      title: "Advanced SMS",
      description: "Threaded messaging with templates & campaigns"
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: "Contact Management",
      description: "Complete CRM with smart organization"
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Analytics Dashboard",
      description: "Real-time insights and performance metrics"
    }
  ];

  const coreFeatures = [
    {
      icon: <PhoneCall className="h-12 w-12" />,
      title: "WebRTC Voice Calling",
      description: "Crystal-clear browser-based calling with Twilio integration. No downloads required.",
      benefits: ["HD voice quality", "Global connectivity", "Browser-based", "Auto-recording"]
    },
    {
      icon: <MessageSquare className="h-12 w-12" />,
      title: "Intelligent SMS Platform",
      description: "Advanced messaging with AI-powered templates, campaigns, and conversation threading.",
      benefits: ["Message templates", "Bulk campaigns", "Thread management", "Auto-responses"]
    },
    {
      icon: <Users className="h-12 w-12" />,
      title: "Smart CRM System",
      description: "Comprehensive contact management with AI insights and automated workflows.",
      benefits: ["Contact segmentation", "Activity tracking", "Lead scoring", "Custom fields"]
    },
    {
      icon: <BarChart3 className="h-12 w-12" />,
      title: "Advanced Analytics",
      description: "Real-time performance metrics and actionable insights for your communication strategy.",
      benefits: ["Real-time dashboards", "Call analytics", "ROI tracking", "Performance reports"]
    },
    {
      icon: <Bot className="h-12 w-12" />,
      title: "AI-Powered Automation",
      description: "Intelligent automation for repetitive tasks and workflow optimization.",
      benefits: ["Smart routing", "Auto-dialing", "Response automation", "Predictive analytics"]
    },
    {
      icon: <Shield className="h-12 w-12" />,
      title: "Enterprise Security",
      description: "Bank-level security with encryption, compliance, and data protection.",
      benefits: ["End-to-end encryption", "GDPR compliant", "SOC 2 certified", "Regular audits"]
    }
  ];

  const useCases = [
    {
      icon: <Building className="h-8 w-8" />,
      title: "Sales Teams",
      description: "Boost your sales performance with intelligent dialing and CRM integration",
      features: ["Lead management", "Call tracking", "Pipeline analytics", "Team collaboration"]
    },
    {
      icon: <Headphones className="h-8 w-8" />,
      title: "Customer Support",
      description: "Deliver exceptional support with advanced call routing and ticket management",
      features: ["Smart routing", "Call recording", "Support analytics", "Knowledge base"]
    },
    {
      icon: <Megaphone className="h-8 w-8" />,
      title: "Marketing Teams",
      description: "Execute powerful SMS campaigns with advanced targeting and analytics",
      features: ["Campaign management", "A/B testing", "Automation", "Performance tracking"]
    },
    {
      icon: <UserCheck className="h-8 w-8" />,
      title: "HR & Recruiting",
      description: "Streamline your hiring process with automated calling and candidate management",
      features: ["Candidate tracking", "Interview scheduling", "Automated reminders", "Team coordination"]
    }
  ];

  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Sales Director",
      company: "TechCorp",
      avatar: "/api/placeholder/60/60",
      content: "Closo transformed our sales process. We increased call volume by 300% and improved conversion rates significantly.",
      rating: 5
    },
    {
      name: "Mike Chen",
      role: "Customer Success Manager",
      company: "GrowthCo",
      avatar: "/api/placeholder/60/60",
      content: "The SMS campaigns feature helped us improve customer engagement by 250%. The analytics are incredibly detailed.",
      rating: 5
    },
    {
      name: "Emily Rodriguez",
      role: "Operations Manager",
      company: "ServicePro",
      avatar: "/api/placeholder/60/60",
      content: "Implementation was seamless and the support team is outstanding. Our team productivity increased by 40%.",
      rating: 5
    }
  ];

  const pricingPlans = [
    {
      name: "Starter",
      price: "$29",
      period: "per user/month",
      description: "Perfect for small teams getting started",
      features: [
        "Up to 5 users",
        "1,000 minutes/month",
        "Basic CRM",
        "SMS messaging",
        "Email support",
        "Basic analytics"
      ],
      popular: false
    },
    {
      name: "Professional",
      price: "$59",
      period: "per user/month",
      description: "Ideal for growing businesses",
      features: [
        "Up to 25 users",
        "5,000 minutes/month",
        "Advanced CRM",
        "SMS campaigns",
        "Call recording",
        "Advanced analytics",
        "Priority support",
        "API access"
      ],
      popular: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "contact us",
      description: "For large organizations with specific needs",
      features: [
        "Unlimited users",
        "Unlimited minutes",
        "White-label solution",
        "Custom integrations",
        "Advanced security",
        "Dedicated support",
        "SLA guarantee",
        "Custom features"
      ],
      popular: false
    }
  ];

  const stats = [
    { value: "99.9%", label: "Uptime Guarantee" },
    { value: "50M+", label: "Calls Processed" },
    { value: "10K+", label: "Happy Customers" },
    { value: "150+", label: "Countries Supported" }
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Navigation */}
      <nav className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2 group">
              <img 
                src={ClosoLogo} 
                alt="DialPax" 
                className="h-8 w-auto brightness-0 dark:invert transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                Features
              </a>
              <a href="#use-cases" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                Use Cases
              </a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                Pricing
              </a>
              <a href="#testimonials" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                Testimonials
              </a>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/login">
                <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge className="mb-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              🚀 New: Advanced SMS Campaigns Now Available
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Transform Your Communication with{" "}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                DialPax
              </span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
              The most advanced cloud-based dialer and CRM platform. Boost your team's productivity with 
              intelligent calling, SMS campaigns, and comprehensive analytics.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link href="/login">
                <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3">
                  <PlayCircle className="mr-2 h-5 w-5" />
                  Start Free Trial
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="px-8 py-3">
                <Play className="mr-2 h-5 w-5" />
                Watch Demo
              </Button>
            </div>
            
            {/* Hero Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {heroFeatures.map((feature, index) => (
                <Card key={index} className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6 text-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mx-auto mb-4 text-white">
                      {feature.icon}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center text-white">
                <div className="text-3xl md:text-4xl font-bold mb-2">{stat.value}</div>
                <div className="text-blue-100">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Powerful Features for Modern Teams
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Everything you need to manage calls, messages, and customer relationships in one unified platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {coreFeatures.map((feature, index) => (
              <Card key={index} className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center mb-6 text-white group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    {feature.description}
                  </p>
                  <div className="space-y-2">
                    {feature.benefits.map((benefit, bIndex) => (
                      <div key={bIndex} className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                        {benefit}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Built for Every Team
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Closo adapts to your industry and workflow, providing specialized solutions for different business needs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {useCases.map((useCase, index) => (
              <Card key={index} className="bg-white dark:bg-gray-900 border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className="p-8">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mb-6 text-white">
                    {useCase.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    {useCase.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    {useCase.description}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {useCase.features.map((feature, fIndex) => (
                      <div key={fIndex} className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Trusted by Industry Leaders
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              See what our customers are saying about Closo
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 border-0 shadow-lg">
                <CardContent className="p-8">
                  <div className="flex items-center mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 mb-6 italic">
                    "{testimonial.content}"
                  </p>
                  <div className="flex items-center">
                    <Avatar className="h-12 w-12 mr-4">
                      <AvatarImage src={testimonial.avatar} alt={testimonial.name} />
                      <AvatarFallback>{testimonial.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">{testimonial.name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{testimonial.role} at {testimonial.company}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Choose the plan that fits your team's needs. All plans include 14-day free trial.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, index) => (
              <Card key={index} className={`relative border-0 shadow-lg hover:shadow-xl transition-all duration-300 ${plan.popular ? 'ring-2 ring-blue-500 scale-105' : ''}`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-8">
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{plan.name}</h3>
                    <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                      {plan.price}
                      {plan.price !== "Custom" && <span className="text-lg text-gray-500">/{plan.period}</span>}
                    </div>
                    <p className="text-gray-600 dark:text-gray-300">{plan.description}</p>
                  </div>
                  <div className="space-y-4 mb-8">
                    {plan.features.map((feature, fIndex) => (
                      <div key={fIndex} className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                        <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/login">
                    <Button 
                      className={`w-full ${plan.popular ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700' : ''}`}
                      variant={plan.popular ? "default" : "outline"}
                    >
                      {plan.price === "Custom" ? "Contact Sales" : "Start Free Trial"}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Communication?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of businesses that trust Closo for their communication needs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-3">
                <Rocket className="mr-2 h-5 w-5" />
                Get Started Free
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3">
              <Phone className="mr-2 h-5 w-5" />
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <img src={ClosoLogo} alt="DialPax" className="h-8 w-auto brightness-0 invert" />
              </div>
              <p className="text-gray-400 mb-4">
                The most advanced cloud-based dialer and CRM platform for modern teams.
              </p>
              <div className="flex space-x-4">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <Globe className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <Mail className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <Phone className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 FallOwl. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}