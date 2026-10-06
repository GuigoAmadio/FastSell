import { AddressesService } from './addresses.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AddressesService (unit)', () => {
  const prisma = {
    address: {
      count: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new AddressesService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create marca isDefault=true quando e o primeiro endereco', async () => {
    (prisma.address.count as jest.Mock).mockResolvedValue(0);
    (prisma.address.create as jest.Mock).mockImplementation(({ data }) => ({
      id: 'addr-1',
      ...data,
    }));

    const result = await service.create('user-1', {
      cep: '01310100',
      street: 'Av Paulista',
      number: '100',
      neighborhood: 'Bela Vista',
      city: 'Sao Paulo',
      state: 'sp',
    });

    expect(prisma.address.updateMany).toHaveBeenCalled();
    expect(prisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDefault: true,
          state: 'SP',
        }),
      }),
    );
    expect(result.isDefault).toBe(true);
  });

  it('setDefault zera outros e marca o escolhido', async () => {
    (prisma.address.findUnique as jest.Mock).mockResolvedValue({
      id: 'a2',
      userId: 'user-1',
    });
    (prisma.address.update as jest.Mock).mockResolvedValue({
      id: 'a2',
      isDefault: true,
    });

    await service.setDefault('user-1', 'a2');

    expect(prisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { isDefault: false },
    });
    expect(prisma.address.update).toHaveBeenCalledWith({
      where: { id: 'a2' },
      data: { isDefault: true },
    });
  });
});
