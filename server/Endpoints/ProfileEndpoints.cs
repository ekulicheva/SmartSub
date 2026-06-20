using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SmartSub.Api.Data;
using SmartSub.Api.Dtos;
using SmartSub.Api.Models;

namespace SmartSub.Api.Endpoints;

public static class ProfileEndpoints
{
    public static void MapProfileEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/profile").WithTags("Profile").RequireAuthorization();
        var hasher = new PasswordHasher<User>();

        group.MapGet("/", async (HttpContext ctx, AppDbContext db) =>
        {
            var userId = GetUserId(ctx);
            var user = await db.Users.FindAsync(userId);
            if (user is null) return Results.NotFound();

            return Results.Ok(new ProfileResponse(
                user.Email, user.DisplayName, user.CreatedAt, user.DefaultNotifyDaysBefore
            ));
        });

        group.MapPut("/", async (UpdateProfileRequest req, HttpContext ctx, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.DisplayName))
                return Results.BadRequest(new { error = "Имя не может быть пустым" });

            if (req.DefaultNotifyDaysBefore < 0 || req.DefaultNotifyDaysBefore > 30)
                return Results.BadRequest(new { error = "Количество дней должно быть от 0 до 30" });

            var userId = GetUserId(ctx);
            var user = await db.Users.FindAsync(userId);
            if (user is null) return Results.NotFound();

            user.DisplayName = req.DisplayName.Trim();
            user.DefaultNotifyDaysBefore = req.DefaultNotifyDaysBefore;
            await db.SaveChangesAsync();

            return Results.Ok(new ProfileResponse(
                user.Email, user.DisplayName, user.CreatedAt, user.DefaultNotifyDaysBefore
            ));
        });

        group.MapPost("/change-password", async (ChangePasswordRequest req, HttpContext ctx, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 6)
                return Results.BadRequest(new { error = "Новый пароль должен быть не короче 6 символов" });

            var userId = GetUserId(ctx);
            var user = await db.Users.FindAsync(userId);
            if (user is null) return Results.NotFound();

            var verify = hasher.VerifyHashedPassword(user, user.PasswordHash, req.CurrentPassword);
            if (verify == PasswordVerificationResult.Failed)
                return Results.BadRequest(new { error = "Текущий пароль указан неверно" });

            user.PasswordHash = hasher.HashPassword(user, req.NewPassword);
            await db.SaveChangesAsync();

            return Results.Ok(new { message = "Пароль успешно изменён" });
        });
    }

    private static int GetUserId(HttpContext ctx)
    {
        var idClaim = ctx.User.FindFirstValue("sub")
            ?? throw new InvalidOperationException("Не найден идентификатор пользователя в токене");
        return int.Parse(idClaim);
    }
}
