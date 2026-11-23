import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function loadEnvIfMissing() {
  if (process.env.DATABASE_URL) return;

  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) continue;

      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }

    if (process.env.DATABASE_URL) return;
  }
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scryptCallback(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(`scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`);
    });
  });
}

loadEnvIfMissing();

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_CLIENT_EMAIL || "demo@beautycontent.local").trim().toLowerCase();
  const password = process.env.SEED_CLIENT_PASSWORD || "DemoPassword123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: "Demo Salon Owner",
      passwordHash,
    },
    create: {
      email,
      name: "Demo Salon Owner",
      passwordHash,
    },
  });

  const business = await prisma.business.upsert({
    where: { userId: user.id },
    update: {
      name: "Lumiere Beauty Studio",
      industry: "beauty_salon",
      city: "Chisinau",
      description: "Boutique hair, nail, and facial studio focused on natural, luminous results.",
      targetAudience: "Women aged 24-45 seeking healthy hair coloring, clean manicures, and relaxing skincare.",
      toneOfVoice: "Warm, confident, editorial, never pushy",
      brandAdvantages: "Certified master colorists, medical-grade sterilization, quiet central studio.",
      preferredPhrases: "book your ritual, effortless glow, tailored care",
      forbiddenPhrases: "cheap, discount blowout, miracle cure",
    },
    create: {
      userId: user.id,
      name: "Lumiere Beauty Studio",
      industry: "beauty_salon",
      city: "Chisinau",
      description: "Boutique hair, nail, and facial studio focused on natural, luminous results.",
      targetAudience: "Women aged 24-45 seeking healthy hair coloring, clean manicures, and relaxing skincare.",
      toneOfVoice: "Warm, confident, editorial, never pushy",
      brandAdvantages: "Certified master colorists, medical-grade sterilization, quiet central studio.",
      preferredPhrases: "book your ritual, effortless glow, tailored care",
      forbiddenPhrases: "cheap, discount blowout, miracle cure",
    },
  });

  const existingServicesCount = await prisma.service.count({
    where: { businessId: business.id },
  });

  if (existingServicesCount === 0) {
    await prisma.service.createMany({
      data: [
        {
          businessId: business.id,
          name: "Signature Balayage & Gloss",
          description: "Custom hand-painted dimensional color finished with a shine-sealing bond gloss.",
          price: "1450.00",
          currency: "MDL",
        },
        {
          businessId: business.id,
          name: "Gel Manicure & Nail Architecture",
          description: "Detailed cuticle care and lightweight strengthening overlay for 3+ weeks of wear.",
          price: "450.00",
          currency: "MDL",
        },
        {
          businessId: business.id,
          name: "Hydra Glow Facial Ritual",
          description: "Gentle enzymatic exfoliation, lymphatic massage, and deep barrier hydration.",
          price: "890.00",
          currency: "MDL",
        },
      ],
    });
  }

  const existingProjectsCount = await prisma.project.count({
    where: { userId: user.id },
  });

  if (existingProjectsCount === 0) {
    await prisma.project.createMany({
      data: [
        {
          userId: user.id,
          businessId: business.id,
          type: "post",
          goal: "Promote spring balayage appointments for returning and new salon clients",
          title: "Spring Balayage Refresh",
          content:
            "Soft dimension that grows out gracefully.\n\nOur Signature Balayage & Gloss is tailored to your natural base and finished with a bond-sealing gloss for effortless glow without harsh regrowth lines.\n\nBook your ritual for this week — 3 afternoon slots left.",
          status: "saved",
        },
        {
          userId: user.id,
          businessId: business.id,
          type: "reels",
          goal: "Showcase behind-the-scenes sterilization and nail architecture quality",
          title: "Why Clean Cuticle Work Matters",
          content:
            "Hook: Healthy nails start before the first drop of gel.\n\n1. Medical-grade 3-step sterilization.\n2. Ultra-thin strengthening architecture.\n3. Natural shine that lasts 3+ weeks.\n\nSave this and book your ritual via link in bio.",
          status: "draft",
        },
      ],
    });
  }

  const [servicesCount, projectsCount] = await Promise.all([
    prisma.service.count({ where: { businessId: business.id } }),
    prisma.project.count({ where: { userId: user.id } }),
  ]);

  console.log("Seed completed:");
  console.log(`  Client email:    ${email}`);
  console.log(`  Client password: ${password}`);
  console.log(`  Business:        ${business.name} (${business.id})`);
  console.log(`  Services:        ${servicesCount}`);
  console.log(`  Projects:        ${projectsCount}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
