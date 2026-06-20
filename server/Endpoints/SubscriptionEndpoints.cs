using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartSub.Api.Data;
using SmartSub.Api.Dtos;
using SmartSub.Api.Models;

namespace SmartSub.Api.Endpoints;

public static class SubscriptionEndpoints
{
    public static void MapSubscriptionEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/subscriptions")
            .WithTags("Subscriptions")
            .RequireAuthorization();

        // GET /api/subscriptions?search=netflix&category=Movies
        group.MapGet("/", async (
            HttpContext ctx,
            AppDbContext db,
            string? search,
            SubscriptionCategory? category) =>
        {
            var userId = GetUserId(ctx);

            var query = db.Subscriptions.Where(s => s.UserId == userId);

            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(s => s.Name.Contains(search));

            if (category.HasValue)
                query = query.Where(s => s.Category == category.Value);

            var result = await query
                .OrderBy(s => s.NextPaymentDate)
                .Select(s => SubscriptionResponse.FromEntity(s))
                .ToListAsync();

            return Results.Ok(result);
        });

        // GET /api/subscriptions/{id}
        group.MapGet("/{id:int}", async (int id, HttpContext ctx, AppDbContext db) =>
        {
            var userId = GetUserId(ctx);
            var sub = await db.Subscriptions.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
            return sub is null ? Results.NotFound() : Results.Ok(SubscriptionResponse.FromEntity(sub));
        });

        // POST /api/subscriptions
        group.MapPost("/", async (SubscriptionRequest req, HttpContext ctx, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return Results.BadRequest(new { error = "Название подписки обязательно" });

            if (req.Price < 0)
                return Results.BadRequest(new { error = "Стоимость не может быть отрицательной" });

            var userId = GetUserId(ctx);

            var sub = new Subscription
            {
                UserId = userId,
                Name = req.Name.Trim(),
                Price = req.Price,
                Currency = string.IsNullOrWhiteSpace(req.Currency) ? "RUB" : req.Currency,
                Period = req.Period,
                Category = req.Category,
                NextPaymentDate = req.NextPaymentDate,
                NotifyBeforePayment = req.NotifyBeforePayment,
                NotifyDaysBefore = req.NotifyDaysBefore
            };

            db.Subscriptions.Add(sub);
            await db.SaveChangesAsync();

            return Results.Created($"/api/subscriptions/{sub.Id}", SubscriptionResponse.FromEntity(sub));
        });

        // PUT /api/subscriptions/{id}
        group.MapPut("/{id:int}", async (int id, SubscriptionRequest req, HttpContext ctx, AppDbContext db) =>
        {
            var userId = GetUserId(ctx);
            var sub = await db.Subscriptions.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
            if (sub is null) return Results.NotFound();

            sub.Name = req.Name.Trim();
            sub.Price = req.Price;
            sub.Currency = req.Currency;
            sub.Period = req.Period;
            sub.Category = req.Category;
            sub.NextPaymentDate = req.NextPaymentDate;
            sub.NotifyBeforePayment = req.NotifyBeforePayment;
            sub.NotifyDaysBefore = req.NotifyDaysBefore;

            await db.SaveChangesAsync();
            return Results.Ok(SubscriptionResponse.FromEntity(sub));
        });

        // DELETE /api/subscriptions/{id}
        group.MapDelete("/{id:int}", async (int id, HttpContext ctx, AppDbContext db) =>
        {
            var userId = GetUserId(ctx);
            var sub = await db.Subscriptions.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
            if (sub is null) return Results.NotFound();

            db.Subscriptions.Remove(sub);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // GET /api/subscriptions/stats — статистика для дашборда
        app.MapGet("/api/stats", async (HttpContext ctx, AppDbContext db) =>
        {
            var userId = GetUserId(ctx);
            var subs = await db.Subscriptions.Where(s => s.UserId == userId).ToListAsync();

            var monthlyTotal = subs.Sum(s => s.MonthlyEquivalent);
            var yearlyForecast = monthlyTotal * 12;

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var next = subs
                .Where(s => s.NextPaymentDate >= today)
                .OrderBy(s => s.NextPaymentDate)
                .FirstOrDefault();

            var response = new StatsResponse(
                MonthlyTotal: Math.Round(monthlyTotal, 2),
                YearlyForecast: Math.Round(yearlyForecast, 2),
                NextPayment: next is null ? null : SubscriptionResponse.FromEntity(next),
                ActiveSubscriptionsCount: subs.Count
            );

            return Results.Ok(response);
        }).WithTags("Subscriptions").RequireAuthorization();

        // GET /api/analytics — данные для страницы "Аналитика": разбивка по категориям + помесячный прогноз
        app.MapGet("/api/analytics", async (HttpContext ctx, AppDbContext db) =>
        {
            var userId = GetUserId(ctx);
            var subs = await db.Subscriptions.Where(s => s.UserId == userId).ToListAsync();

            // Разбивка расходов по категориям (в пересчёте на месяц)
            var byCategory = subs
                .GroupBy(s => s.Category)
                .Select(g => new CategoryBreakdown(
                    g.Key,
                    Math.Round(g.Sum(s => s.MonthlyEquivalent), 2)
                ))
                .OrderByDescending(c => c.MonthlyAmount)
                .ToList();

            // Прогноз расходов на ближайшие 6 месяцев (считаем, что состав подписок не меняется)
            var monthlyTotal = subs.Sum(s => s.MonthlyEquivalent);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var forecast = Enumerable.Range(0, 6)
                .Select(offset =>
                {
                    var month = today.AddMonths(offset);
                    return new MonthlyForecastPoint(
                        $"{month.Year}-{month.Month:D2}",
                        Math.Round(monthlyTotal, 2)
                    );
                })
                .ToList();

            var response = new AnalyticsResponse(byCategory, forecast);
            return Results.Ok(response);
        }).WithTags("Subscriptions").RequireAuthorization();
    }

    private static int GetUserId(HttpContext ctx)
    {
        var idClaim = ctx.User.FindFirstValue("sub")
            ?? throw new InvalidOperationException("Не найден идентификатор пользователя в токене");
        return int.Parse(idClaim);
    }
}
