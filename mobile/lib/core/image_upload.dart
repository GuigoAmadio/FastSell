import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

/// Monta o arquivo do upload a partir dos bytes (funciona no celular, desktop
/// e Flutter Web) e informa o tipo correto. A API só aceita PNG/JPG e recusa
/// o padrão "application/octet-stream".
Future<MultipartFile> imageMultipart(XFile file) async {
  final bytes = await file.readAsBytes();
  final isPng = bytes.length > 4 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47;
  final subtype = isPng ? 'png' : 'jpeg';
  final name = file.name.isNotEmpty ? file.name : 'foto.${isPng ? 'png' : 'jpg'}';
  return MultipartFile.fromBytes(
    bytes,
    filename: name,
    contentType: DioMediaType('image', subtype),
  );
}
