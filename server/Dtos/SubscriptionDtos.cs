using SmartSub.Api.Models;

namespace SmartSub.Api.Dtos;

public record SubscriptionRequest(
    string Name,
    decimal Price,
    string Currency,
    BillingPeriod Period,
    SubscriptionCategory Category,
    DateOnly NextPaymentDate,
    bool NotifyBeforePayment,
    int NotifyDaysBefore
);

public record SubscriptionResponse(
    int Id,
    string Name,
    decimal Price,
    string Currency,
    BillingPeriod Period,
    SubscriptionCategory Category,
    DateOnly NextPaymentDate,
    bool NotifyBeforePayment,
    int NotifyDaysBefore
)
{
    public static SubscriptionResponse FromEntity(Subscription s) => new(
        s.Id, s.Name, s.Price, s.Currency, s.Period, s.Category,
        s.NextPaymentDate, s.NotifyBeforePayment, s.NotifyDaysBefore
    );
}

public record StatsResponse(
    decimal MonthlyTotal,
    decimal YearlyForecast,
    SubscriptionResponse? NextPayment,
    int ActiveSubscriptionsCount
);

public record CategoryBreakdown(SubscriptionCategory Category, decimal MonthlyAmount);

public record MonthlyForecastPoint(string Month, decimal Amount);

public record AnalyticsResponse(
    List<CategoryBreakdown> ByCategory,
    List<MonthlyForecastPoint> Forecast
);
