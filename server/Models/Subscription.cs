namespace SmartSub.Api.Models;

public enum BillingPeriod
{
    Monthly,
    Quarterly,
    Yearly
}

public enum SubscriptionCategory
{
    Music,
    Movies,
    Work,
    Security,
    Cloud,
    Other
}

public class Subscription
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Currency { get; set; } = "RUB";
    public BillingPeriod Period { get; set; } = BillingPeriod.Monthly;
    public SubscriptionCategory Category { get; set; } = SubscriptionCategory.Other;

    public DateOnly NextPaymentDate { get; set; }
    public bool NotifyBeforePayment { get; set; } = true;
    public int NotifyDaysBefore { get; set; } = 3;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public decimal MonthlyEquivalent => Period switch
    {
        BillingPeriod.Monthly => Price,
        BillingPeriod.Quarterly => Price / 3m,
        BillingPeriod.Yearly => Price / 12m,
        _ => Price
    };
}
