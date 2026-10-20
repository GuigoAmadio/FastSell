import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AddressesService } from './addresses.service';
import { JwtStrategy } from './jwt.strategy';
import { ResetPageController } from './reset-page.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    MailModule,
    SmsModule,
  ],
  controllers: [AuthController, ResetPageController],
  providers: [AuthService, AddressesService, JwtStrategy],
  exports: [AuthService, MailModule, SmsModule],
})
export class AuthModule {}
