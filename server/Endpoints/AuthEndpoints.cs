using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SmartSub.Api.Data;
using SmartSub.Api.Dtos;
using SmartSub.Api.Models;
using SmartSub.Api.Services;

namespace SmartSub.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");
        var hasher = new PasswordHasher<User>();

        group.MapPost("/register", async (RegisterRequest req, AppDbContext db, JwtService jwt) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { error = "Email и пароль обязательны" });

            if (req.Password.Length < 6)
                return Results.BadRequest(new { error = "Пароль должен быть не короче 6 символов" });

            var emailNormalized = req.Email.Trim().ToLowerInvariant();

            var exists = await db.Users.AnyAsync(u => u.Email == emailNormalized);
            if (exists)
                return Results.Conflict(new { error = "Пользователь с таким email уже зарегистрирован" });

            var user = new User
            {
                Email = emailNormalized,
                DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? emailNormalized : req.DisplayName.Trim()
            };
            user.PasswordHash = hasher.HashPassword(user, req.Password);

            db.Users.Add(user);
            await db.SaveChangesAsync();

            var token = jwt.GenerateToken(user);
            return Results.Ok(new AuthResponse(token, user.Email, user.DisplayName));
        });

        group.MapPost("/login", async (LoginRequest req, AppDbContext db, JwtService jwt) =>
        {
            var emailNormalized = req.Email.Trim().ToLowerInvariant();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == emailNormalized);

            if (user is null)
                return Results.Unauthorized();

            var result = hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password);
            if (result == PasswordVerificationResult.Failed)
                return Results.Unauthorized();

            var token = jwt.GenerateToken(user);
            return Results.Ok(new AuthResponse(token, user.Email, user.DisplayName));
        });
    }
}
