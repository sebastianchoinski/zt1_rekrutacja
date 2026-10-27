import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { calculateRequirements } from '../calculator/calculateRequirements.js';
import { validateInput } from '../calculator/input.js';
import { PrismaService } from './prisma.service.js';

@Controller()
export class CalculationsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }

  @Post('calculations')
  async calculate(@Body() body: unknown) {
    const input = validateInput(body);
    const result = calculateRequirements(input);
    return this.prisma.calculation.create({
      data: {
        orderItem: input.order.item,
        orderQuantity: input.order.quantity,
        materialCount: result.requirements.length,
        input: input as Prisma.InputJsonObject,
        result: result as unknown as Prisma.InputJsonObject,
      },
    });
  }

  @Get('calculations')
  history() {
    return this.prisma.calculation.findMany({
      take: 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        createdAt: true,
        orderItem: true,
        orderQuantity: true,
        materialCount: true,
      },
    });
  }

  @Get('calculations/:id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    const calculation = await this.prisma.calculation.findUnique({ where: { id } });
    if (!calculation) throw new NotFoundException('Nie znaleziono kalkulacji.');
    return calculation;
  }
}
