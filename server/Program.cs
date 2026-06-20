using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SmartSub.Api.Data;
using SmartSub.Api.Endpoints;
using SmartSub.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// ---------- JSON: enum-ы как строки (например "Music", а не 0) ----------
// Это важно для совместимости с фронтендом, который отправляет/ожидает строковые значения enum.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

// ---------- Конфигурация ----------
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Не задан Jwt:Secret в appsettings.json");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "SmartSub.Api";

// ---------- База данных (SQLite) ----------
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=smartsub.db";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(connectionString));

// ---------- Сервисы ----------
builder.Services.AddSingleton<JwtService>();

// ---------- JWT-аутентификация ----------
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    // Отключаем автомаппинг claim-типов: claim "sub" останется "sub",
    // а не превратится в длинный ClaimTypes.NameIdentifier URI.
    options.MapInboundClaims = false;

    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtIssuer,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ClockSkew = TimeSpan.FromMinutes(2)
    };
});

builder.Services.AddAuthorization();

// ---------- CORS (фронтенд может работать на другом порту/origin) ----------
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// ---------- Swagger ----------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "SmartSub API", Version = "v1" });

    c.AddSecurityDefinition("Bearer", new()
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "Введите: Bearer {ваш токен}"
    });

    c.AddSecurityRequirement(new()
    {
        {
            new()
            {
                Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// ---------- Создание БД при старте, если её ещё нет ----------
// Для учебного проекта используем EnsureCreated (без миграций) — это проще для сдачи и проверки.
// Если потребуется эволюция схемы в будущем, можно перейти на dotnet ef migrations.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

// ---------- Middleware pipeline ----------
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

// ---------- Эндпоинты ----------
app.MapAuthEndpoints();
app.MapSubscriptionEndpoints();
app.MapProfileEndpoints();

app.MapGet("/", () => Results.Ok(new { status = "SmartSub API работает", version = "1.0" }))
   .WithTags("Health");

app.Run();
