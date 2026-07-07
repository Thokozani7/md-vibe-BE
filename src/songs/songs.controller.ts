import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { DetectStructureDto } from './detect-structure.dto';
import { DetectStructureResult } from './song.types';
import { SongsService } from './songs.service';

@Controller('songs')
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Post('detect-structure')
  detectStructure(
    @Body() body: DetectStructureDto,
  ): Promise<DetectStructureResult> {
    if (!body?.lyrics || typeof body.lyrics !== 'string') {
      throw new BadRequestException('lyrics is required');
    }
    return this.songsService.detectStructure(body);
  }
}
