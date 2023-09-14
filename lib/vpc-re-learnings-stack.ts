import { Stack, StackProps } from "aws-cdk-lib";
import { AutoScalingGroup } from "aws-cdk-lib/aws-autoscaling";
import {
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  InstanceClass,
  InstanceSize,
  InstanceType,
  LaunchTemplate,
  SecurityGroup,
  UserData,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerAction,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

export class VpcReLearningsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    [1, 2].map((count) => {
      // VPC
      // Creates routing for public and private subnets - route tables/rules via Internet Gateway and NAT Gateway for public/private
      const vpc1 = new Vpc(this, `VPC${count}`, {
        // cidr: Defaults to 10.0.0.0/16
        maxAzs: 99, // Defaults to 3, high number will results in all AZs being used
        // natGateways: Defaults to 1 (per AZ)
        // subnetConfiguration: Defaults to 1 private/1 public per AZ evenly splitting the CIDR range
        flowLogs: { VPC1: {} }, // Defaults none, when set each key defaults to all types of logs to Cloudwatch
      });

      // Target Group to route requests to
      const targetGroup = new ApplicationTargetGroup(this, `Target Group ${count}`, {
        vpc: vpc1,
        protocol: ApplicationProtocol.HTTP,
        port: 80,
      });

      // Load balancer
      // Defaults to one in every availability zone
      const alb = new ApplicationLoadBalancer(this, `ALB${count}`, {
        vpc: vpc1,
        internetFacing: true,
        // vpcSubnets: Defaults to SubnetSelection.PRIVATE_WITH_NAT, which is what we created above
      });
      // Routing rule for incoming load balanced traffic
      alb.addListener("HTTP Traffic", {
        protocol: ApplicationProtocol.HTTP,
        port: 80,
        defaultAction: ListenerAction.forward([targetGroup]),
      });

      // Launch Template start up script
      const userData = UserData.forLinux();
      userData.addCommands(
        "yum install -y nginx",
        "yum update -y",
        "yum install -y httpd",
        "systemctl start httpd",
        "systemctl enable httpd",
        `echo "<h1>Hello World ${count} from $(hostname -f)</h1>" > /var/www/html/index.html`
      );

      // Template for instances launched by the auto-scaling group
      // Cannot be used with auto-scaling group without a security group being set on it
      // const launchTemplate = new LaunchTemplate(this, "Launch Template 1", {
      //   userData,
      //   machineImage: new AmazonLinuxImage({
      //     generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      //   }),
      //   instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      //   securityGroup:
      // });

      // Auto Scaling Group to control scaling in and out
      const autoscalingGroup = new AutoScalingGroup(
        this,
        `AutoScaling Group ${count}`,
        {
          vpc: vpc1,
          // vpcSubnets: Defaults to all private subnets
          maxCapacity: 5,
          minCapacity: 2,
          desiredCapacity: 3,
          // Cannot be present with a launch template
          machineImage: new AmazonLinuxImage({
            generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
          }),
          // Cannot be present with a launch template
          instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
          userData,
          // launchTemplate,
        }
      );
      autoscalingGroup.scaleOnCpuUtilization("Scale", {
        targetUtilizationPercent: 80,
      });
      autoscalingGroup.attachToApplicationTargetGroup(targetGroup);
    });
  }
}
